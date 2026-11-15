// test/raidmimic-relay.test.js — the Raid Mimic party relay (apps/raidmimic-relay/).
//
// What can go wrong without anyone noticing: a merge that SUMS the submitters (every raider's agent sees the same
// fight, so a 20-person party shows 20x the damage and nobody can tell from the numbers), a free party that
// receives the paid streams, a malformed or oversized frame that crashes the service or is echoed back, a party
// that never expires (memory), a code alphabet with look-alike letters, a trial that is granted twice, a session
// lookup that hits the database on every hello, and a token that ends up in a log line or a view.
//
// lib.js is built-ins only; the end-to-end block needs `ws`, which lives in apps/raidmimic-relay/node_modules
// (CI installs it: .github/workflows/test.yml). The resolver is stubbed, so nothing here touches Supabase.
//
// Run: npx vitest run test/raidmimic-relay.test.js   (after `npm ci --prefix apps/raidmimic-relay`)

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stripSql, stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = require('../apps/raidmimic-relay/lib.js');

const TOKEN = (n) => 'wpms_' + String(n).repeat(64).slice(0, 64);
const T0 = 1_800_000_000_000;
const member = (key, tier = 'pro', extra = {}) => ({ key, character: key, tier, trialEndsAt: null, ...extra });
const pub = (perPlayer, extra = {}) => {
  const v = lib.validatePub({ type: 'pub', perPlayer, ...extra }, T0);
  if (!v.ok) throw new Error('fixture invalid: ' + v.reason);
  return v.pub;
};

describe('codes', () => {
  it('uses the unambiguous alphabet and is 6 long', () => {
    expect(lib.CODE_ALPHABET).toHaveLength(31);
    for (const bad of '01OIL') expect(lib.CODE_ALPHABET).not.toContain(bad);
    for (let i = 0; i < 200; i++) expect(lib.makeCode()).toMatch(lib.CODE_RE);
  });
  it('normalises case and rejects look-alikes and wrong lengths', () => {
    expect(lib.normalizeCode(' abc234 ')).toBe('ABC234');
    for (const bad of ['ABC23', 'ABC2345', 'ABCO23', 'ABC123', 'ABCI23', 'ABCL23', '', null, 12]) expect(lib.normalizeCode(bad)).toBeNull();
  });
});

describe('validation drops bad frames', () => {
  it('accepts a full good frame and rebuilds it field by field', () => {
    const v = lib.validatePub({ type: 'pub', evil: 'x', perPlayer: { Aldenmar: { dmg: 10, heal: 0, took: 2, threat: 5, extra: 9 } }, target: 'a gnoll', casting: 'Complete Heal',
      roster: [{ name: 'Brackwyn', hp: 80, junk: 1 }], fires: [{ text: 'Mez broke', at: T0 - 1000 }] }, T0);
    expect(v.ok).toBe(true);
    expect(v.pub.perPlayer.get('Aldenmar')).toEqual({ dmg: 10, heal: 0, took: 2, threat: 5 });
    expect(v.pub.roster).toEqual([{ name: 'Brackwyn', hp: 80 }]);
    expect(JSON.stringify([...v.pub.perPlayer])).not.toContain('extra');
  });
  const bad = {
    'negative number': { perPlayer: { Aldenmar: { dmg: -1 } } },
    'NaN-ish string': { perPlayer: { Aldenmar: { dmg: '5' } } },
    'infinite (JSON null→0 is fine, a huge number is not)': { perPlayer: { Aldenmar: { dmg: 1e300 } } },
    'name with a digit': { perPlayer: { 'Alden1': { dmg: 1 } } },
    'name with a space': { perPlayer: { 'Al den': { dmg: 1 } } },
    'name too long': { perPlayer: { [`${'a'.repeat(25)}`]: { dmg: 1 } } },
    '__proto__ name': JSON.parse('{"perPlayer":{"__proto__":{"dmg":1}}}'),
    'perPlayer is an array': { perPlayer: [] },
    'roster hp above 100': { roster: [{ name: 'Aldenmar', hp: 101 }] },
    'roster not an array': { roster: 'x' },
    'fire text too long': { fires: [{ text: 'x'.repeat(121), at: T0 }] },
    'fire text with a control char': { fires: [{ text: 'a\u0007b', at: T0 }] },
    'too many fires': { fires: Array.from({ length: 21 }, (_, i) => ({ text: 'f' + i, at: T0 })) },
    'target too long': { target: 'x'.repeat(121) },
  };
  for (const [name, body] of Object.entries(bad)) {
    it(`drops: ${name}`, () => {
      const v = lib.validatePub({ type: 'pub', ...body }, T0);
      expect(v.ok).toBe(false);
      expect(JSON.stringify(v)).not.toContain('Alden');        // the reason is a fixed word, never the input
    });
  }
  it('drops more than 80 rows', () => {
    const rows = {};
    for (let i = 0; i < 81; i++) rows[`P${'abcdefghij'[i % 10]}${'klmnopqrst'[Math.floor(i / 10)]}`] = { dmg: 1 };
    expect(lib.validatePub({ type: 'pub', perPlayer: rows }, T0).ok).toBe(false);
    const ok = Object.fromEntries(Object.entries(rows).slice(0, 80));
    expect(lib.validatePub({ type: 'pub', perPlayer: ok }, T0).ok).toBe(true);
  });
  it('parseFrame refuses over 32 KB, non-JSON and non-objects, and never throws', () => {
    expect(lib.parseFrame('x'.repeat(lib.MAX_FRAME_BYTES + 1))).toBeNull();
    expect(lib.parseFrame('{"a":"' + 'x'.repeat(lib.MAX_FRAME_BYTES) + '"}')).toBeNull();
    expect(lib.parseFrame('not json')).toBeNull();
    expect(lib.parseFrame('[1]')).toBeNull();
    expect(lib.parseFrame('')).toBeNull();
    expect(lib.parseFrame(Buffer.from('{"type":"pub"}'))).toEqual({ type: 'pub' });
  });
  it('clamps a fire time into the last 10 minutes', () => {
    const v = lib.validatePub({ type: 'pub', fires: [{ text: 'a', at: T0 + 9e6 }, { text: 'b', at: 1 }] }, T0);
    expect(v.pub.fires.map((f) => f.at)).toEqual([T0, T0 - lib.HISTORY_SPAN_MS]);
  });
  it('validates a hello: token shape, exactly one of party/create, character', () => {
    const good = { type: 'hello', token: TOKEN('a'), create: true, character: "Aldenmar", agent_version: '3.6.9' };
    expect(lib.validateHello(good).ok).toBe(true);
    expect(lib.validateHello({ ...good, create: false, party: 'abc234' }).hello.party).toBe('ABC234');
    for (const b of [{ token: 'wpms_short' }, { token: TOKEN('a').toUpperCase() }, { character: 'bad name' }, { party: 'ABC234' }, { create: false }, { create: false, party: 'ABCO23' }]) {
      expect(lib.validateHello({ ...good, ...b }).ok).toBe(false);
    }
  });
});

describe('merge takes the MAX across submitters, never the sum', () => {
  it('three agents reporting the same fight show one fight, not three', () => {
    const p = new lib.Party('ABC234', T0);
    for (const k of ['a', 'b', 'c']) p.add(member(k));
    p.ingest('a', pub({ Aldenmar: { dmg: 1000, heal: 10, took: 5, threat: 7 } }), T0);
    p.ingest('b', pub({ Aldenmar: { dmg: 1200, heal: 0, took: 9, threat: 7 } }), T0 + 1000);
    p.ingest('c', pub({ Aldenmar: { dmg: 900, heal: 30, took: 1, threat: 3 } }), T0 + 2000);
    const row = p.merged(T0 + 3000).players[0];
    expect([row.dmg, row.heal, row.took, row.threat]).toEqual([1200, 30, 9, 7]);
    expect(row.age.dmg).toBe(2000);        // b's frame, 2 s old at T0+3000
    expect(row.age.threat).toBe(2000);     // a (3 s old) and b (2 s old) tie on 7; the fresher one is named
    expect(row.age.heal).toBe(1000);       // c's 30 wins heal
  });
  it('a player only one agent sees still appears; a later frame replaces the same member wholesale', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a')); p.add(member('b'));
    p.ingest('a', pub({ Aldenmar: { dmg: 500 } }), T0);
    p.ingest('b', pub({ Brackwyn: { dmg: 300 } }), T0);
    p.ingest('a', pub({ Aldenmar: { dmg: 100 } }), T0 + 2000);       // a's new frame wins over a's old one (latest wins)
    const m = p.merged(T0 + 2500);
    expect(m.players.map((x) => [x.name, x.dmg])).toEqual([['Brackwyn', 300], ['Aldenmar', 100]]);
  });
  it('ignores a submitter whose frame is older than 30 s and flags the view stale after 10 s', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a'));
    p.ingest('a', pub({ Aldenmar: { dmg: 500 } }), T0);
    expect(p.merged(T0 + 9000).stale).toBe(false);
    expect(p.merged(T0 + 11000).stale).toBe(true);
    expect(p.merged(T0 + 31000).players).toEqual([]);
  });
  it('drops a frame published faster than the minimum gap', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a'));
    expect(p.ingest('a', pub({ Aldenmar: { dmg: 1 } }), T0)).toBe(true);
    expect(p.ingest('a', pub({ Aldenmar: { dmg: 2 } }), T0 + 100)).toBe(false);
    expect(p.merged(T0 + 200).players[0].dmg).toBe(1);
  });
  it('dedupes fires and sends the last 20, oldest first', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a')); p.add(member('b'));
    const fires = (n, from) => Array.from({ length: n }, (_, i) => ({ text: 'f' + (from + i), at: T0 - 5000 + (from + i) }));
    p.ingest('a', pub({}, { fires: fires(20, 0) }), T0);
    p.ingest('b', pub({}, { fires: fires(20, 10) }), T0);     // 10 overlap
    const v = p.view(T0 + 1000);
    expect(v.fires).toHaveLength(20);
    expect(v.fires.at(-1).text).toBe('f29');
    expect(new Set(v.fires.map((f) => f.text)).size).toBe(20);
  });
  it('the view carries no token, hash or socket', () => {
    const p = new lib.Party('ABC234', T0);
    p.add({ ...member('a'), ws: {} }); p.ingest('a', pub({ Aldenmar: { dmg: 1 } }), T0);
    expect(JSON.stringify(p.view(T0 + 1))).not.toMatch(/wpms_|token|ws/);
  });
});

describe('tiers and caps', () => {
  const day = 86400000;
  it('tier rule: pro beats trial beats free', () => {
    const now = T0;
    expect(lib.playerTier({ wolfpackMember: true }, now)).toBe('pro');
    expect(lib.playerTier({ guildPlans: ['commons', 'managed'] }, now)).toBe('pro');
    expect(lib.playerTier({ guildPlans: ['commons'] }, now)).toBe('free');
    expect(lib.playerTier({ plan: 'pro' }, now)).toBe('pro');
    expect(lib.playerTier({ trialEndsAt: new Date(now + day).toISOString() }, now)).toBe('trial');
    expect(lib.playerTier({ trialEndsAt: new Date(now - 1).toISOString() }, now)).toBe('free');
    expect(lib.playerTier({ plan: 'pro', trialEndsAt: new Date(now + day).toISOString() }, now)).toBe('pro');
    expect(lib.playerTier({}, now)).toBe('free');
  });
  it('party tier is its best member; an ended trial counts as free while connected', () => {
    expect(lib.partyTier(['free', 'trial', 'free'])).toBe('trial');
    expect(lib.partyTier(['free', 'pro', 'trial'])).toBe('pro');
    expect(lib.partyTier([])).toBe('free');
    const ends = new Date(T0 + 1000).toISOString();
    expect(lib.memberTier({ tier: 'trial', trialEndsAt: ends }, T0)).toBe('trial');
    expect(lib.memberTier({ tier: 'trial', trialEndsAt: ends }, T0 + 2000)).toBe('free');
  });
  // Live merging is free for everyone (DECISIONS §588): a free party has the full size and every stream.
  it('a free party takes up to 72 members, like any other', () => {
    const p = new lib.Party('ABC234', T0);
    for (let i = 0; i < 72; i++) { expect(p.canJoin(member('m' + i, 'free'), T0)).toBe(true); p.add(member('m' + i, 'free')); }
    expect(p.canJoin(member('m73', 'free'), T0)).toBe(false);
    expect(lib.capForTier('free')).toBe(72);
    expect(lib.capForTier('trial')).toBe(72);
  });
  it('a free party gets every stream: per-player numbers, target, casting and history', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a', 'free'));
    p.ingest('a', pub({ Aldenmar: { dmg: 99 } }, { target: 'a gnoll', casting: 'Heal', roster: [{ name: 'Aldenmar', hp: 50 }], fires: [{ text: 'Mez', at: T0 }] }), T0);
    const v = p.view(T0 + 1);
    expect(v.tier).toBe('free');
    expect(v.players[0].dmg).toBe(99);
    expect(v.target).toBe('a gnoll');
    expect(v.roster).toEqual([{ name: 'Aldenmar', hp: 50 }]);
    expect(v.fires).toHaveLength(1);
    expect(p.sampleHistory(T0 + 1)).toBe(true);   // a fresh sample is kept for a free party too
  });
  it('one paid member lifts the whole party to every stream', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a', 'free')); p.add(member('b', 'pro'));
    p.ingest('a', pub({ Aldenmar: { dmg: 99 } }, { target: 'a gnoll' }), T0);
    const v = p.view(T0 + 1);
    expect(v.tier).toBe('pro');
    expect(v.players[0].dmg).toBe(99);
    expect(v.target).toBe('a gnoll');
  });
  it('reports the latest trial end only while the party is on a trial', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a', 'trial', { trialEndsAt: new Date(T0 + 5e6).toISOString() }));
    expect(p.view(T0).trial_ends_at).toBe(new Date(T0 + 5e6).toISOString());
    p.add(member('b', 'pro'));
    expect(p.view(T0).trial_ends_at).toBeNull();
  });
});

describe('party lifecycle and history', () => {
  it('dies 15 minutes after the last member leaves, not before', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a'));
    expect(p.expired(T0 + 99 * 60000)).toBe(false);          // occupied
    p.remove('a', T0 + 1000);
    expect(p.expired(T0 + 1000 + lib.PARTY_GRACE_MS - 1)).toBe(false);
    expect(p.expired(T0 + 1000 + lib.PARTY_GRACE_MS)).toBe(true);
    p.add(member('a'));                                       // a rejoin within the grace revives it
    expect(p.expired(T0 + 1000 + lib.PARTY_GRACE_MS * 2)).toBe(false);
  });
  it('an abandoned new code expires too', () => {
    expect(new lib.Party('ABC234', T0).expired(T0 + lib.PARTY_GRACE_MS)).toBe(true);
  });
  it('keeps merged frames every 10 s for 10 minutes and no more', () => {
    const p = new lib.Party('ABC234', T0);
    p.add(member('a'));
    let sampled = 0;
    for (let t = T0; t <= T0 + 20 * 60000; t += 2000) {
      p.ingest('a', pub({ Aldenmar: { dmg: (t - T0) / 1000 } }), t);
      if (p.sampleHistory(t)) sampled++;
    }
    expect(sampled).toBe(121);                                // one per 10 s over 20 min
    expect(p.history.length).toBeLessThanOrEqual(61);
    expect(p.history[0].t).toBeGreaterThanOrEqual(T0 + 10 * 60000);
    expect(JSON.stringify(p.history)).not.toMatch(/wpms_|age/);
  });
});

describe('failed-hello limiter', () => {
  it('blocks an IP after 10 failures in a minute and forgives after', () => {
    const l = new lib.FailLimiter();
    for (let i = 0; i < 10; i++) { expect(l.blocked('1.2.3.4', T0 + i)).toBe(false); l.fail('1.2.3.4', T0 + i); }
    expect(l.blocked('1.2.3.4', T0 + 100)).toBe(true);
    expect(l.blocked('5.6.7.8', T0 + 100)).toBe(false);
    expect(l.blocked('1.2.3.4', T0 + 61000)).toBe(false);
  });
});

describe('resolve cache', () => {
  const mk = () => {
    let t = T0, calls = 0, answer = { player_id: 'p1', tier: 'free' };
    const rpc = { resolve: async () => { calls++; if (answer instanceof Error) throw answer; return answer; }, startTrial: async () => '2026-12-01T00:00:00Z' };
    const c = lib.cachedResolver(rpc, { now: () => t });
    return { c, calls: () => calls, tick: (ms) => { t += ms; }, set: (a) => { answer = a; } };
  };
  it('caches a hit for 5 minutes and a miss for 60 seconds', async () => {
    const x = mk();
    await x.c.resolve(TOKEN('a')); await x.c.resolve(TOKEN('a'));
    expect(x.calls()).toBe(1);
    x.tick(lib.RESOLVE_HIT_MS - 1); await x.c.resolve(TOKEN('a'));
    expect(x.calls()).toBe(1);
    x.tick(2); await x.c.resolve(TOKEN('a'));
    expect(x.calls()).toBe(2);
    x.set(null);
    x.tick(lib.RESOLVE_HIT_MS + 1);
    expect(await x.c.resolve(TOKEN('b'))).toBeNull();
    const n = x.calls();
    x.tick(lib.RESOLVE_MISS_MS - 1); await x.c.resolve(TOKEN('b'));
    expect(x.calls()).toBe(n);
    x.tick(2); await x.c.resolve(TOKEN('b'));
    expect(x.calls()).toBe(n + 1);
  });
  it('shares one call between simultaneous lookups and never caches an error', async () => {
    const x = mk();
    await Promise.all([x.c.resolve(TOKEN('a')), x.c.resolve(TOKEN('a')), x.c.resolve(TOKEN('a'))]);
    expect(x.calls()).toBe(1);
    x.set(new lib.ResolveError('down'));
    await expect(x.c.resolve(TOKEN('c'))).rejects.toThrow();
    x.set({ player_id: 'p2', tier: 'pro' });
    expect((await x.c.resolve(TOKEN('c'))).tier).toBe('pro');
  });
  it('starting a trial forgets the cached identity', async () => {
    const x = mk();
    await x.c.resolve(TOKEN('a'));
    expect(await x.c.startTrial(TOKEN('a'))).toBe('2026-12-01T00:00:00Z');
    await x.c.resolve(TOKEN('a'));
    expect(x.calls()).toBe(2);
  });
  it('the RPC client sends the token only as the RPC argument, with the anon key', async () => {
    const seen = [];
    const rpc = lib.supabaseRpc({ url: 'https://x.supabase.co/', anonKey: 'ANON', fetchImpl: async (u, o) => { seen.push([u, o]); return { ok: true, json: async () => null }; } });
    await rpc.resolve(TOKEN('a'));
    expect(seen[0][0]).toBe('https://x.supabase.co/rest/v1/rpc/relay_resolve_session');
    expect(JSON.parse(seen[0][1].body)).toEqual({ p_token: TOKEN('a') });
    expect(seen[0][1].headers.apikey).toBe('ANON');
    const down = lib.supabaseRpc({ url: 'https://x', anonKey: 'k', fetchImpl: async () => ({ ok: false, status: 503 }) });
    await expect(down.resolve(TOKEN('a'))).rejects.toBeInstanceOf(lib.ResolveError);
  });
});

describe('the migration', () => {
  const sql = stripSql(fs.readFileSync(path.join(root, 'supabase/migrations/20261115150000_raidmimic_relay.sql'), 'utf8'));
  it('is definer-only, anon-executable, and returns no token or hash', () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
    expect(sql).toMatch(/grant execute on function public\.relay_resolve_session\(text\) to anon/);
    expect(sql).toMatch(/grant execute on function public\.relay_start_trial\(text\)\s+to anon/);
    expect(sql).toMatch(/revoke all on function public\.relay_resolve_session\(text\) from public/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.hub_player_entitlements from anon/);
    const from = sql.indexOf("jsonb_build_object(\n    'player_id', v_player");
    const ret = sql.slice(from, sql.indexOf('$$;', from));
    expect(ret).not.toMatch(/session_token|p_token|discord_id|user_id/);
  });
  it('encodes the tier rule: managed guild or pro plan or Wolf Pack member, else an unexpired trial', () => {
    expect(sql).toMatch(/hg\.plan = 'managed' and hg\.suspended_at is null/);
    expect(sql).toMatch(/hm\.left_at is null/);
    expect(sql).toMatch(/v_ent\.plan = 'pro'/);
    expect(sql).toMatch(/now\(\) < v_ent\.trial_ends_at/);
    expect(sql).toMatch(/interval '14 days'/);
    expect(sql).toMatch(/on conflict \(player_id\) do nothing/);
  });
});

// ── End to end: a real ws client against the real server on an ephemeral port, the RPC stubbed ───────────────
let ws;
try { ws = require('../apps/raidmimic-relay/node_modules/ws'); } catch { ws = null; }
const e2e = ws ? describe : describe.skip;

e2e('end to end', () => {
  const { createRelay } = require('../apps/raidmimic-relay/index.js');
  const open = [];
  let relay;

  const identities = {
    [TOKEN('a')]: { player_id: 'pa', display_name: 'A', scope: 'member', guild_id: 'wolfpack', hub_plan: null, tier: 'pro', trial_ends_at: null },
    [TOKEN('b')]: { player_id: 'pb', display_name: 'B', scope: 'player', guild_id: '~player', hub_plan: null, tier: 'free', trial_ends_at: null },
    [TOKEN('c')]: { player_id: 'pc', display_name: 'C', scope: 'player', guild_id: '~player', hub_plan: null, tier: 'free', trial_ends_at: null },
  };
  const trials = [];
  const stub = {
    resolve: async (t) => identities[t] || null,
    startTrial: async (t) => {
      trials.push(t);
      identities[t] = { ...identities[t], tier: 'trial', trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString() };
      return identities[t].trial_ends_at;
    },
  };

  async function boot(opts = {}) {
    relay = createRelay({ rpc: stub, quiet: true, viewEveryMs: 50, ...opts });
    const port = await relay.start(0, '127.0.0.1');
    return port;
  }
  afterEach(async () => {
    for (const c of open.splice(0)) { try { c.terminate(); } catch { /* gone */ } }
    if (relay) { await relay.stop(); relay = null; }
    trials.length = 0;
  });

  // A client that queues everything it receives.
  function client(port, headers) {
    const c = new ws(`ws://127.0.0.1:${port}/v1/party`, { headers });
    c.inbox = [];
    c.on('message', (d) => c.inbox.push(JSON.parse(d.toString())));
    c.closed = new Promise((r) => c.on('close', (code) => r(code)));
    c.opened = new Promise((r, j) => { c.on('open', r); c.on('error', j); });
    open.push(c);
    return c;
  }
  const until = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 10)); }
  };
  const next = (c, type) => until(() => { const i = c.inbox.findIndex((m) => m.type === type); return i < 0 ? null : c.inbox.splice(i, 1)[0]; });
  const hello = (c, o) => c.send(JSON.stringify({ type: 'hello', agent_version: '3.6.9', ...o }));

  it('serves /health with counts and nothing secret', async () => {
    const port = await boot();
    const j = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    expect(Object.keys(j).sort()).toEqual(['clients', 'ok', 'parties', 'version']);
    expect(j.ok).toBe(true);
  });

  it('creates a party, joins it, merges two agents by max and serves the same view to both', async () => {
    const port = await boot();
    const a = client(port); await a.opened;
    hello(a, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
    const w = await next(a, 'welcome');
    expect(w.party).toMatch(lib.CODE_RE);
    expect(w.tier).toBe('pro');

    const b = client(port); await b.opened;
    hello(b, { token: TOKEN('b'), party: w.party.toLowerCase(), character: 'Brackwyn' });
    expect((await next(b, 'welcome')).tier).toBe('pro');         // the paid creator lifts the party

    a.send(JSON.stringify({ type: 'pub', perPlayer: { Corvale: { dmg: 500, heal: 0, took: 1, threat: 1 } }, roster: [{ name: 'Aldenmar', hp: 90 }], fires: [{ text: 'Root broke', at: Date.now() }] }));
    b.send(JSON.stringify({ type: 'pub', perPlayer: { Corvale: { dmg: 450, heal: 5, took: 1, threat: 2 } } }));
    const v = await until(() => { const m = [...a.inbox].reverse().find((x) => x.type === 'view' && x.players.length && x.members === 2 && x.players[0].heal === 5 && x.players[0].dmg === 500); return m; });
    expect(v.players[0]).toMatchObject({ name: 'Corvale', dmg: 500, heal: 5, threat: 2 });
    expect(v.roster).toEqual([{ name: 'Aldenmar', hp: 90 }]);
    expect(v.fires[0].text).toBe('Root broke');
    expect(v.stale).toBe(false);
    const vb = await until(() => [...b.inbox].reverse().find((x) => x.type === 'view' && x.players.length && x.players[0].heal === 5));
    expect(vb.players).toEqual(v.players);
    expect(JSON.stringify([...a.inbox, ...b.inbox])).not.toContain('wpms_');

    b.send(JSON.stringify({ type: 'history' }));
    expect((await next(b, 'history')).party).toBe(w.party);
  });

  it('starts the trial when a free creator makes a party, once', async () => {
    const port = await boot();
    const c = client(port); await c.opened;
    hello(c, { token: TOKEN('c'), create: true, character: 'Zarrin' });
    const w = await next(c, 'welcome');
    expect(w.tier).toBe('trial');
    expect(trials).toEqual([TOKEN('c')]);
    const v = await next(c, 'view');
    expect(v.trial_ends_at).toBeTruthy();
    const c2 = client(port); await c2.opened;
    hello(c2, { token: TOKEN('c'), create: true, character: 'Nyssara' });
    await next(c2, 'welcome');
    expect(trials).toHaveLength(1);                                // the second create did not start another
  });

  it('answers a bad token, an unknown party and a malformed hello with a code and a close, and rate-limits the IP', async () => {
    const port = await boot();
    const x = client(port); await x.opened;
    hello(x, { token: TOKEN('9'), create: true, character: 'Aldenmar' });
    expect((await next(x, 'error')).code).toBe('unknown_session');
    expect(await x.closed).toBe(4401);
    const y = client(port); await y.opened;
    hello(y, { token: TOKEN('a'), party: 'ZZZZZZ', character: 'Aldenmar' });
    expect((await next(y, 'error')).code).toBe('no_party');
    const z = client(port); await z.opened;
    z.send('not json');
    expect((await next(z, 'error')).code).toBe('bad_hello');
    for (let i = 0; i < 8; i++) { const q = client(port); await q.opened; q.send('{'); await q.closed; }
    const blocked = client(port); await blocked.opened;
    expect((await next(blocked, 'error')).code).toBe('slow_down');
    expect(await blocked.closed).toBe(4429);
  });

  it('survives garbage after the hello and ignores a pub it will not accept', async () => {
    const port = await boot();
    const a = client(port); await a.opened;
    hello(a, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
    await next(a, 'welcome');
    a.send('garbage'); a.send(JSON.stringify({ type: 'pub', perPlayer: { Corvale: { dmg: -5 } } }));
    a.send(Buffer.from('x'.repeat(40 * 1024)));
    await new Promise((r) => setTimeout(r, 120));
    expect(a.readyState).toBe(1);
    const v = [...a.inbox].reverse().find((m) => m.type === 'view');
    expect(v.players).toEqual([]);
    expect(JSON.stringify(a.inbox)).not.toContain('garbage');
  });

  it('lets a free party past 6 members and a second connection of the same character replaces the first', async () => {
    const port = await boot();
    identities[TOKEN('f')] = { player_id: 'pf', tier: 'free', trial_ends_at: new Date(Date.now() - 1000).toISOString() };   // a used-up trial: stays free
    const first = client(port); await first.opened;
    hello(first, { token: TOKEN('f'), create: true, character: 'Aldenmar' });
    const { party } = await next(first, 'welcome');
    expect(trials).toHaveLength(0);
    // five more distinct characters on one free player join, then a seventh: live merging has no free cap (§588)
    const extra = [];
    for (const n of ['Brackwyn', 'Corvale', 'Rethlan', 'Nyssara', 'Zarrin']) {
      const c = client(port); await c.opened; hello(c, { token: TOKEN('f'), party, character: n }); await next(c, 'welcome'); extra.push(c);
    }
    const seventh = client(port); await seventh.opened;
    hello(seventh, { token: TOKEN('f'), party, character: 'Eldrith' });
    await next(seventh, 'welcome');
    const again = client(port); await again.opened;
    hello(again, { token: TOKEN('f'), party, character: 'Aldenmar' });
    await next(again, 'welcome');
    expect((await next(first, 'error')).code).toBe('replaced');
  });

  it('drops dead sockets on heartbeat and closes everyone on shutdown', async () => {
    const port = await boot();
    const a = client(port); await a.opened;
    hello(a, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
    await next(a, 'welcome');
    for (const s of relay.clients) s.isAlive = false;             // a pong that never came
    relay.heartbeat();
    await a.closed;
    await until(() => relay.clients.size === 0);
    const b = client(port); await b.opened;
    hello(b, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
    await next(b, 'welcome');
    const stopping = relay.stop(); relay = null;
    expect(await b.closed).toBe(1001);
    await stopping;
  });

  it('turns away client 3 when the process is capped at 2', async () => {
    const port = await boot({ maxClients: 2 });
    const a = client(port), b = client(port); await Promise.all([a.opened, b.opened]);
    const c = client(port); await c.opened;
    expect((await next(c, 'error')).code).toBe('busy');
  });

  it('enforces RELAY_ALLOWED_ORIGINS for browsers only', async () => {
    const port = await boot({ allowedOrigins: ['https://raidmimic.com'] });
    const bad = client(port, { origin: 'https://evil.example' });
    await expect(bad.opened).rejects.toBeTruthy();
    const ok = client(port, { origin: 'https://raidmimic.com' }); await ok.opened;
    const none = client(port); await none.opened;                 // Mimic sends no Origin
  });

  it('the relay never logs or holds a token: index.js and lib.js carry no console output of frames', () => {
    const src = stripJs(fs.readFileSync(path.join(root, 'apps/raidmimic-relay/index.js'), 'utf8'));
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/log\([^)]*token/i);
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
});
