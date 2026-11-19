// Platform admin (the guild lead, 2026-11-18, Desk card platform-admin): the bot's route counters, the owner gate that
// fails closed, the stall rule, and the signed call from the web to the bot.
//
// Run: npx vitest run test/platform-admin.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const rs = require('../utils/routeStats.js');
const stalls = require('../utils/platformStalls.js');
const auth = require('../utils/platformStatsAuth.js');
const { isSiteOwner, siteOwnerIds, isStuck, funnel, platformSig } = await import('../web/lib/platformAdmin.ts');

const H = rs.HOUR_MS;
const T0 = 1_800_000 * H;   // an hour boundary

describe('routeStats', () => {
  beforeEach(() => rs._reset());

  it('counts requests and bytes per route', () => {
    rs.record('GET', '/api/agent/poll?x=1', 100, T0);
    rs.record('GET', '/api/agent/poll', 50, T0 + 1000);
    rs.record('POST', '/api/agent/chat', 10, T0);
    const r = rs.report(T0 + 2000);
    const poll = r.routes.find(x => x.route === 'GET /api/agent/poll');
    expect(poll).toEqual({ route: 'GET /api/agent/poll', requests: 2, bytes: 150 });
    expect(r.total_bytes).toBe(160);
    expect(r.routes[0].route).toBe('GET /api/agent/poll');   // sorted by bytes
  });

  it('folds ids and tokens so the key set stays small', () => {
    expect(rs.normalizeRoute('GET', '/api/x/12345?a=b')).toBe('GET /api/x/:id');
    expect(rs.normalizeRoute('get', '/api/x/0b0e7a52-1111-4222-8333-444455556666')).toBe('GET /api/x/:id');
    expect(rs.normalizeRoute('GET', '/api/x/wpms_' + 'a'.repeat(64))).toBe('GET /api/x/:id');
    expect(rs.normalizeRoute('GET', '/api/agent/poll')).toBe('GET /api/agent/poll');
  });

  it('caps the number of keys and folds the rest into (other)', () => {
    for (let i = 0; i < rs.MAX_KEYS + 25; i++) rs.record('GET', `/r/name${i}`, 1, T0);
    const r = rs.report(T0);
    expect(r.routes.length).toBe(rs.MAX_KEYS + 1);
    expect(r.routes.find(x => x.route === rs.OTHER_KEY).requests).toBe(25);
  });

  it('rolls: buckets older than 24 h drop out of the report', () => {
    rs.record('GET', '/old', 500, T0);
    rs.record('GET', '/new', 7, T0 + 23 * H);
    expect(rs.report(T0 + 23 * H).total_bytes).toBe(507);
    const later = rs.report(T0 + 24 * H);       // /old is now 24 h back
    expect(later.routes.map(x => x.route)).toEqual(['GET /new']);
    rs.record('GET', '/newer', 1, T0 + 25 * H); // pruning also frees the old key slot
    expect(rs.report(T0 + 25 * H).routes.map(x => x.route).sort()).toEqual(['GET /new', 'GET /newer']);
  });

  it('instrument counts written bytes once, on close', () => {
    const res = new EventEmitter();
    res.write = () => true;
    res.end = () => res;
    rs.instrument({ method: 'GET', url: '/api/agent/poll' }, res, () => T0);
    res.write('abc');
    res.end(Buffer.from('defgh'));
    res.emit('close'); res.emit('close');
    const r = rs.report(T0);
    expect(r.routes).toEqual([{ route: 'GET /api/agent/poll', requests: 1, bytes: 8 }]);
  });

  it('is wired once at the top of the dispatcher and the stats route is signed', () => {
    const src = stripJs(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
    const i = src.indexOf('http.createServer(async (req, res) => {');
    expect(src.slice(i, i + 200)).toMatch(/routeStats'\)\.instrument\(req, res\)/);
    expect(src).toMatch(/\/api\\\/platform\\\/stats/);
    expect(src).toMatch(/platformStatsAuth'\)\.verify/);
  });
});

describe('owner gate', () => {
  const user = id => ({ identities: [{ provider: 'discord', id, identity_data: { provider_id: id } }] });

  it('fails closed with no env, a blank env or junk entries', () => {
    for (const raw of [undefined, null, '', ' , ', 'abc,12']) {
      expect(siteOwnerIds(raw)).toEqual([]);
      expect(isSiteOwner(user('111111111111111111'), raw)).toBe(false);
    }
  });
  it('admits only a listed id; no user, no discord identity, or user_metadata alone does not', () => {
    const raw = '111111111111111111, 222222222222222222';
    expect(isSiteOwner(user('222222222222222222'), raw)).toBe(true);
    expect(isSiteOwner(user('333333333333333333'), raw)).toBe(false);
    expect(isSiteOwner(null, raw)).toBe(false);
    expect(isSiteOwner({ user_metadata: { provider_id: '111111111111111111' } }, raw)).toBe(false);
  });
  it('the page calls the gate after requireOfficer and 404s a non-owner', () => {
    const src = stripJs(fs.readFileSync(path.join(ROOT, 'web/app/admin/platform/page.tsx'), 'utf8'));
    expect(src.indexOf('requireOfficer()')).toBeLessThan(src.indexOf('isSiteOwner(user)'));
    expect(src).toMatch(/if \(!isSiteOwner\(user\)\) notFound\(\)/);
    expect(src.indexOf('notFound()')).toBeLessThan(src.indexOf('supabaseAdmin()'));
  });
});

describe('stall rule', () => {
  const NOW = Date.parse('2026-11-18T12:00:00Z');
  const ago = h => new Date(NOW - h * 3600 * 1000).toISOString();
  const g = (id, h, extra = {}) => ({ guild_id: id, display_name: id, created_at: ago(h), ...extra });

  it('picks guilds past 24 h with no invite and one member, skipping the already told', () => {
    const guilds = [g('fresh', 5), g('stuck', 30), g('invited', 30), g('crowd', 30), g('told', 30), g('ancient', 24 * 40), g('susp', 30, { suspended_at: ago(1) })];
    const out = stalls.stalledGuilds({
      guilds, now: NOW, dmed: new Set(['told']),
      members: new Map([['stuck', 1], ['invited', 1], ['crowd', 2], ['told', 1], ['ancient', 1], ['susp', 1], ['fresh', 1]]),
      invites: new Map([['invited', 1]]),
    });
    expect(out.map(x => x.guild_id)).toEqual(['stuck']);
  });
  it('the web marker agrees: stuck only past 24 h, no invite, one member', () => {
    expect(isStuck(ago(30), 0, 1, NOW)).toBe(true);
    expect(isStuck(ago(30), 1, 1, NOW)).toBe(false);
    expect(isStuck(ago(30), 0, 2, NOW)).toBe(false);
    expect(isStuck(ago(3), 0, 1, NOW)).toBe(false);
  });
  it('skips quietly with no owner env, and DMs once then latches in bot_kv', async () => {
    const calls = { select: [], upsert: [], dms: [] };
    const sb = {
      isEnabled: () => true,
      select: async (t, q) => {
        calls.select.push(t);
        if (t === 'hub_guilds') return [g('stuck', 30)];
        return [];
      },
      selectAllPaged: async (t) => { calls.select.push(t); return []; },
      upsert: async (t, rows) => { calls.upsert.push([t, rows]); return rows; },
    };
    const client = { users: { fetch: async id => ({ send: async m => { calls.dms.push([id, m.content]); } }) } };
    const quiet = await stalls.runStallCheck({ supabase: sb, client, now: NOW, env: {} });
    expect(quiet).toEqual({ skipped: true, dmed: 0 });
    expect(calls.select).toEqual([]);
    const r = await stalls.runStallCheck({ supabase: sb, client, now: NOW, env: { SITE_OWNER_DISCORD_IDS: '111111111111111111' } });
    expect(r.dmed).toBe(1);
    expect(calls.dms[0][1]).toContain('https://raidmimic.com/guilds/stuck');
    expect(calls.upsert[0][0]).toBe('bot_kv');
    expect(calls.upsert[0][1][0].key).toBe('platform_stall_dm:stuck');
  });
});

describe('funnel and signed call', () => {
  it('counts the funnel without names', () => {
    const f = funnel({
      players: new Set(['p1', 'p2', 'p3']),
      guilds: [{ guild_id: 'a' }, { guild_id: 'b' }],
      invites: [{ guild_id: 'a' }, { guild_id: 'a' }],
      memberships: [
        { guild_id: 'a', player_id: 'p1', role: 'owner', left_at: null },
        { guild_id: 'a', player_id: 'p2', role: 'member', left_at: null },
        { guild_id: 'a', player_id: 'p3', role: 'member', left_at: '2026-01-01' },
        { guild_id: 'b', player_id: 'gone', role: 'owner', left_at: null },
      ],
    });
    expect([f.players, f.madeGuild, f.guilds, f.withInvite, f.multiMember]).toEqual([3, 1, 2, 1, 1]);
  });
  it('web signature verifies on the bot for this and the previous minute only', () => {
    const key = 'service-role-key';
    const now = Date.now();
    expect(auth.verify(platformSig(key, now), key, now)).toBe(true);
    expect(auth.verify(platformSig(key, now - 60000), key, now)).toBe(true);
    expect(auth.verify(platformSig(key, now - 180000), key, now)).toBe(false);
    expect(auth.verify(platformSig('other', now), key, now)).toBe(false);
    expect(auth.verify('', key, now)).toBe(false);
    expect(auth.verify(platformSig(key, now), '', now)).toBe(false);
  });
});
