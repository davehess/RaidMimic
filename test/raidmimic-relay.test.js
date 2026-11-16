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
  it('clamps a fire time into the history window', () => {
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
  it('keeps merged frames every 10 s for 20 minutes and no more', () => {
    expect(lib.HISTORY_SPAN_MS).toBe(20 * 60000);
    const p = new lib.Party('ABC234', T0);
    p.add(member('a'));
    let sampled = 0;
    for (let t = T0; t <= T0 + 40 * 60000; t += 2000) {
      p.ingest('a', pub({ Aldenmar: { dmg: (t - T0) / 1000 } }), t);
      if (p.sampleHistory(t)) sampled++;
    }
    expect(sampled).toBe(241);                                // one per 10 s over 40 min
    expect(p.history.length).toBeLessThanOrEqual(121);
    expect(p.history[0].t).toBeGreaterThanOrEqual(T0 + 20 * 60000);
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

describe('shared timers', () => {
  const MIN = 60000;
  const tm = (o = {}) => ({ kind: 'debuff', spell: 'Tashan', target: "a Shik`nar Forager", caster: 'Aldenmar', endsAt: T0 + 5 * MIN, ...o });
  const run = (timers, character = 'Aldenmar') => lib.validatePub({ type: 'pub', timers }, T0, character);

  it('keeps a good timer and rebuilds it field by field', () => {
    const v = run([{ ...tm(), may_break: true, junk: 1 }]);
    expect(v.ok).toBe(true);
    expect(v.pub.timers).toEqual([{ kind: 'debuff', spell: 'Tashan', target: "a Shik`nar Forager", caster: 'Aldenmar', endsAt: T0 + 5 * MIN, may_break: true }]);
  });
  it('a frame without timers leaves them null (keep the previous set); [] is a snapshot', () => {
    expect(lib.validatePub({ type: 'pub' }, T0, 'Aldenmar').pub.timers).toBeNull();
    expect(run([]).pub.timers).toEqual([]);
    expect(lib.validatePub({ type: 'pub', timers: 'x' }, T0, 'Aldenmar').ok).toBe(false);
  });
  it('drops only the bad timer, never the frame', () => {
    const v = lib.validatePub({ type: 'pub', perPlayer: { Aldenmar: { dmg: 5 } }, timers: [
      tm(), tm({ spell: '' }), tm({ spell: 'x'.repeat(61) }), tm({ spell: 'bad\nspell' }), tm({ kind: 'nuke' }),
      tm({ caster: 'Brackwyn' }), tm({ caster: 'Alden1' }), tm({ target: 'a<b>' }), tm({ target: 'x'.repeat(65) }),
      tm({ endsAt: T0 - 1 }), tm({ endsAt: T0 }), tm({ endsAt: '99' }), tm({ endsAt: NaN }), 'str', null,
    ] }, T0, 'Aldenmar');
    expect(v.ok).toBe(true);
    expect(v.pub.perPlayer.get('Aldenmar').dmg).toBe(5);
    expect(v.pub.timers).toHaveLength(1);
  });
  it('drops a timer that has already ended', () => {
    expect(run([tm({ endsAt: T0 - 1 }), tm({ spell: 'Now', endsAt: T0 }), tm({ spell: 'Ok', endsAt: T0 + 1 })]).pub.timers.map((t) => t.spell)).toEqual(['Ok']);
  });
  it('accepts only timers the member cast itself (caster must be its own character)', () => {
    expect(run([tm({ caster: 'Brackwyn' })]).pub.timers).toEqual([]);
    expect(run([tm()], null).pub.timers).toEqual([]);          // no known character → nothing accepted
  });
  it('allows a mob name with digits, spaces, hyphens and apostrophes', () => {
    expect(run([tm({ target: "Lord Nagafen-2 's" })]).pub.timers).toHaveLength(1);
  });
  it('clamps buffs and debuffs to 20 minutes and charms to 3 hours', () => {
    const v = run([tm({ kind: 'buff', endsAt: T0 + 90 * MIN }), tm({ spell: 'D', endsAt: T0 + 90 * MIN }),
      tm({ kind: 'charm', spell: 'Tunare\'s Request', endsAt: T0 + 3 * 60 * MIN }), tm({ kind: 'charm', spell: 'Allure', endsAt: T0 + 9 * 60 * MIN })]);
    const by = Object.fromEntries(v.pub.timers.map((t) => [t.spell, t.endsAt]));
    expect(by.Tashan).toBe(T0 + 20 * MIN);
    expect(by.D).toBe(T0 + 20 * MIN);
    expect(by["Tunare's Request"]).toBe(T0 + 180 * MIN);
    expect(by.Allure).toBe(T0 + 180 * MIN);
  });
  it('drops the 101st timer', () => {
    const many = Array.from({ length: 101 }, (_, i) => tm({ spell: `S${i}` }));
    const v = run(many);
    expect(v.pub.timers).toHaveLength(100);
    expect(v.pub.timers.some((t) => t.spell === 'S100')).toBe(false);
  });

  const party = () => { const p = new lib.Party('ABC234', T0); p.add(member('a', 'free', { character: 'Aldenmar' })); p.add(member('b', 'free', { character: 'Brackwyn' })); return p; };
  const pubT = (timers, character, at = T0) => lib.validatePub({ type: 'pub', timers }, at, character).pub;

  it('a newer frame from the same caster replaces the entry, and a dropped timer is removed', () => {
    const p = party();
    p.ingest('a', pubT([tm(), tm({ spell: 'Other' })], 'Aldenmar'), T0);
    expect(p.view(T0).timers.map((t) => t.spell).sort()).toEqual(['Other', 'Tashan']);
    p.ingest('a', pubT([tm({ endsAt: T0 + 9 * MIN })], 'Aldenmar', T0 + 2000), T0 + 2000);
    const t = p.view(T0 + 2000).timers;
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ spell: 'Tashan', endsAt: T0 + 9 * MIN });
  });
  it('a frame with no timers field keeps them; an empty list clears only that caster', () => {
    const p = party();
    p.ingest('a', pubT([tm()], 'Aldenmar'), T0);
    p.ingest('b', pubT([tm({ caster: 'Brackwyn', spell: 'Slow' })], 'Brackwyn'), T0);
    p.ingest('a', pub({ Aldenmar: { dmg: 1 } }), T0 + 2000);
    expect(p.view(T0 + 2000).timers).toHaveLength(2);
    p.ingest('a', pubT([], 'Aldenmar', T0 + 4000), T0 + 4000);
    expect(p.view(T0 + 4000).timers.map((t) => t.caster)).toEqual(['Brackwyn']);
  });
  it('sorts by endsAt, caps the view at 200 and is in every tier', () => {
    const p = party();
    p.ingest('a', pubT([tm({ spell: 'Late', endsAt: T0 + 9 * MIN }), tm({ spell: 'Soon', endsAt: T0 + MIN })], 'Aldenmar'), T0);
    const v = p.view(T0);
    expect(v.tier).toBe('free');
    expect(v.timers.map((t) => t.spell)).toEqual(['Soon', 'Late']);
    const big = new lib.Party('ZZZ234', T0);
    for (let i = 0; i < 3; i++) { const c = `Mem${'abc'[i]}`; big.add(member(c, 'pro', { character: c })); }
    for (let i = 0; i < 3; i++) { const c = `Mem${'abc'[i]}`; big.ingest(c, pubT(Array.from({ length: 100 }, (_, j) => tm({ caster: c, spell: `S${j}`, endsAt: T0 + MIN + j })), c), T0); }
    expect(big.view(T0).timers).toHaveLength(200);
  });
  it('prunes expired timers on every view', () => {
    const p = party();
    p.ingest('a', pubT([tm({ endsAt: T0 + MIN }), tm({ spell: 'Long', endsAt: T0 + 10 * MIN })], 'Aldenmar'), T0);
    expect(p.view(T0 + MIN - 1).timers).toHaveLength(2);
    expect(p.view(T0 + MIN).timers.map((t) => t.spell)).toEqual(['Long']);
    expect(p.timers.size).toBe(1);
  });
  it('a member leaving keeps its timers until they end', () => {
    const p = party();
    p.ingest('a', pubT([tm()], 'Aldenmar'), T0);
    p.remove('a', T0 + 1000);
    expect(p.view(T0 + 2000).timers).toHaveLength(1);
    expect(p.view(T0 + 5 * MIN).timers).toHaveLength(0);
  });
});

// ── Auto mode (relay 1.2.0): the game's own group/raid lists decide who shares with whom ──────────────────────
describe('auto mode: the hello and the members list', () => {
  const good = { type: 'hello', token: TOKEN('a'), auto: true, character: 'Aldenmar', agent_version: '4.0.90' };
  it('accepts auto:true with no code, and refuses auto mixed with create or a party', () => {
    expect(lib.validateHello(good)).toEqual({ ok: true, hello: { token: TOKEN('a'), party: null, create: false, auto: true, character: 'Aldenmar', agentVersion: '4.0.90' } });
    expect(lib.validateHello({ ...good, create: true }).code).toBe('bad_party');
    expect(lib.validateHello({ ...good, party: 'ABC234' }).code).toBe('bad_party');
    expect(lib.validateHello({ ...good, auto: 'yes' }).code).toBe('bad_party');     // only a literal true is auto; a code party still needs its code
    expect(lib.validateHello({ ...good, auto: false, create: true }).hello.auto).toBe(false);
  });
  it('validates members like names, dedupes, caps at 72 and drops the frame on one bad name', () => {
    const run = (members) => lib.validatePub({ type: 'pub', members }, T0);
    expect(run(['Brackwyn', 'Corvale', 'Brackwyn']).pub.members).toEqual(['Brackwyn', 'Corvale']);
    expect(lib.validatePub({ type: 'pub' }, T0).pub.members).toBeNull();
    expect(run([]).pub.members).toEqual([]);
    expect(run(['Brackwyn', 'Corv4le']).ok).toBe(false);
    expect(run(['Brackwyn', 5]).ok).toBe(false);
    expect(run('Brackwyn').ok).toBe(false);
    const names = (n) => Array.from({ length: n }, (_, i) => 'Pa' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)));
    expect(run(names(72)).ok).toBe(true);
    expect(run(names(73)).ok).toBe(false);
  });
});

describe('auto mode: the mutual rule', () => {
  // One auto member, already connected and having published `extra` with its pipe lists.
  const mk = (idx, name, list, extra = {}, at = T0) => {
    const e = idx.add(member(name));
    const v = lib.validatePub({ type: 'pub', ...(list ? { members: list } : {}), ...extra }, at, name);
    if (!v.ok) throw new Error('fixture invalid: ' + v.reason);
    idx.ingest(e, v.pub, at);
    return e;
  };
  const dmg = (n) => ({ perPlayer: { Mob: { dmg: n } } });
  const seen = (idx, e, now = T0 + 1000) => idx.view(e, now);

  it('shares when A lists B and B lists A', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], dmg(100));
    const b = mk(idx, 'Brackwyn', ['Aldenmar'], { perPlayer: { Zed: { dmg: 40 } } });
    expect(seen(idx, a).players.map((p) => p.name).sort()).toEqual(['Mob', 'Zed']);
    expect(seen(idx, b).players.map((p) => p.name).sort()).toEqual(['Mob', 'Zed']);
    expect(seen(idx, a).members).toBe(2);
    expect(seen(idx, a)).toMatchObject({ type: 'view', auto: true, party: null });
  });

  it('does NOT share when only one side lists the other (either direction)', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], dmg(100));
    const b = mk(idx, 'Brackwyn', ['Corvale'], { perPlayer: { Zed: { dmg: 40 } } });     // B lists someone else, not A
    expect(seen(idx, a).players.map((p) => p.name)).toEqual(['Mob']);
    expect(seen(idx, b).players.map((p) => p.name)).toEqual(['Zed']);
    expect(seen(idx, a).members).toBe(1);
  });

  it('a stranger who writes your name in their list gets nothing, and you get nothing of theirs', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], dmg(100));
    const x = mk(idx, 'Zarrin', ['Aldenmar', 'Brackwyn', 'Corvale'], { perPlayer: { Spy: { dmg: 1 } } });
    expect(seen(idx, x).players.map((p) => p.name)).toEqual(['Spy']);
    expect(seen(idx, a).players.map((p) => p.name)).toEqual(['Mob']);
  });

  it('per-member views differ: C is in B\'s list and lists B, but A lists neither', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], { perPlayer: { Ann: { dmg: 1 } } });
    const b = mk(idx, 'Brackwyn', ['Aldenmar', 'Corvale'], { perPlayer: { Bob: { dmg: 2 } } });
    const c = mk(idx, 'Corvale', ['Aldenmar', 'Brackwyn'], { perPlayer: { Cat: { dmg: 3 } } });   // C lists A, A does not list C
    const names = (e) => seen(idx, e).players.map((p) => p.name).sort();
    expect(names(a)).toEqual(['Ann', 'Bob']);
    expect(names(b)).toEqual(['Ann', 'Bob', 'Cat']);
    expect(names(c)).toEqual(['Bob', 'Cat']);
  });

  it('matches names case-insensitively and always includes the member itself, listed or not', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['brackwyn'], dmg(100));
    mk(idx, 'Brackwyn', ['ALDENMAR'], { perPlayer: { Zed: { dmg: 40 } } });
    expect(seen(idx, a).players.map((p) => p.name).sort()).toEqual(['Mob', 'Zed']);
    const solo = mk(idx, 'Nyssara', [], { perPlayer: { Own: { dmg: 5 } } });
    expect(seen(idx, solo).players.map((p) => p.name)).toEqual(['Own']);
  });

  it('uses the roster names when a frame has no members list, and keeps the last list when a frame has neither', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', null, { roster: [{ name: 'Brackwyn', hp: 90 }], ...dmg(100) });
    const b = mk(idx, 'Brackwyn', null, { roster: [{ name: 'Aldenmar', hp: 80 }], perPlayer: { Zed: { dmg: 40 } } });
    expect(seen(idx, a).members).toBe(2);
    // B's next frame carries neither: its list is kept, so the match survives
    const v = lib.validatePub({ type: 'pub', perPlayer: { Zed: { dmg: 41 } } }, T0 + 2000, 'Brackwyn');
    idx.ingest(b, v.pub, T0 + 2000);
    expect(seen(idx, a, T0 + 3000).members).toBe(2);
    // members wins over roster: B now lists only itself in `members` (roster still names A), so the match ends
    idx.ingest(b, lib.validatePub({ type: 'pub', members: ['Corvale'], roster: [{ name: 'Aldenmar', hp: 1 }] }, T0 + 4000, 'Brackwyn').pub, T0 + 4000);
    expect(seen(idx, a, T0 + 4500).members).toBe(1);
  });

  it('a member that never published a list shares with nobody', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], dmg(100));
    const b = idx.add(member('Brackwyn'));                      // connected, no frame yet
    expect(seen(idx, a).members).toBe(1);
    expect(seen(idx, b).members).toBe(1);
  });

  it('a disconnected member leaves every other member\'s set', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], dmg(100));
    const b = mk(idx, 'Brackwyn', ['Aldenmar'], dmg(50));
    expect(seen(idx, a).members).toBe(2);
    idx.remove(b);
    expect(seen(idx, a).members).toBe(1);
    expect(idx.size).toBe(1);
  });

  it('timers follow the same rule: B\'s timer reaches A, a one-sided C\'s does not, and A\'s own stays', () => {
    const idx = new lib.AutoIndex();
    const tm = (caster, spell) => ({ kind: 'debuff', spell, target: 'a gnoll', caster, endsAt: T0 + 5 * 60000 });
    const a = mk(idx, 'Aldenmar', ['Brackwyn', 'Corvale'], { timers: [tm('Aldenmar', 'Tashan')] });
    mk(idx, 'Brackwyn', ['Aldenmar'], { timers: [tm('Brackwyn', 'Malo')] });
    mk(idx, 'Corvale', ['Zarrin'], { timers: [tm('Corvale', 'Slow')] });         // C does not list A back
    expect(seen(idx, a).timers.map((t) => t.spell)).toEqual(['Malo', 'Tashan']);
    expect(seen(idx, a, T0 + 6 * 60000).timers).toEqual([]);                    // expired timers are pruned from the view
  });

  it('a newer frame\'s timer list replaces that member\'s timers (a snapshot), and no field keeps them', () => {
    const idx = new lib.AutoIndex();
    const tm = (spell) => ({ kind: 'buff', spell, target: 'Aldenmar', caster: 'Aldenmar', endsAt: T0 + 60000 });
    const a = mk(idx, 'Aldenmar', [], { timers: [tm('Haste'), tm('Focus')] });
    idx.ingest(a, lib.validatePub({ type: 'pub' }, T0 + 1000, 'Aldenmar').pub, T0 + 1000);
    expect(seen(idx, a, T0 + 1500).timers).toHaveLength(2);
    idx.ingest(a, lib.validatePub({ type: 'pub', timers: [tm('Haste')] }, T0 + 2000, 'Aldenmar').pub, T0 + 2000);
    expect(seen(idx, a, T0 + 2500).timers.map((t) => t.spell)).toEqual(['Haste']);
  });

  it('fires follow the same rule, deduped across the set', () => {
    const idx = new lib.AutoIndex();
    const fire = (text, at = T0 - 1000) => ({ text, at });
    const a = mk(idx, 'Aldenmar', ['Brackwyn'], { fires: [fire('Root broke'), fire('Same')] });
    const b = mk(idx, 'Brackwyn', ['Aldenmar'], { fires: [fire('Same'), fire('Mez broke', T0 - 500)] });
    const c = mk(idx, 'Corvale', ['Aldenmar'], { fires: [fire('Secret')] });      // one-sided
    expect(seen(idx, a).fires.map((f) => f.text).sort()).toEqual(['Mez broke', 'Root broke', 'Same']);
    expect(seen(idx, b).fires).toEqual(seen(idx, a).fires);
    expect(seen(idx, c).fires.map((f) => f.text)).toEqual(['Secret']);
  });

  it('merges by MAX within the set, never the sum, and ignores a stale frame', () => {
    const idx = new lib.AutoIndex();
    const a = mk(idx, 'Aldenmar', ['Brackwyn', 'Corvale'], { perPlayer: { Mob: { dmg: 1000 } } });
    mk(idx, 'Brackwyn', ['Aldenmar'], { perPlayer: { Mob: { dmg: 1200 } } });
    mk(idx, 'Corvale', ['Aldenmar'], { perPlayer: { Mob: { dmg: 9999 } } }, T0 - lib.SAMPLE_TTL_MS - 1);
    expect(seen(idx, a).players.find((p) => p.name === 'Mob').dmg).toBe(1200);
  });

  it('caps one view at 72 members however many list each other', () => {
    const idx = new lib.AutoIndex();
    const nm = (i) => 'Pa' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const all = Array.from({ length: 100 }, (_, i) => nm(i));
    // a member's own list is capped at 72 names (validation), so a 100-member mutual crowd resolves to at most 73 -> 72
    const first = mk(idx, all[0], all.slice(1, 73));
    for (let i = 1; i < 100; i++) mk(idx, all[i], [all[0]]);
    const v = seen(idx, first);
    expect(v.members).toBe(72);
  });

  it('computes 500 per-member views quickly', () => {
    const idx = new lib.AutoIndex();
    const nm = (i) => 'Pa' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const entries = [];
    for (let g = 0; g < 8; g++) {                                       // 8 raids of 62, mutual inside each
      const raid = Array.from({ length: 62 }, (_, i) => nm(g * 62 + i));
      for (const n of raid) entries.push(mk(idx, n, raid, { perPlayer: { [n]: { dmg: 5 } } }));
    }
    const t0 = Date.now();
    for (const e of entries) idx.view(e, T0 + 1000);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(idx.view(entries[0], T0 + 1000).members).toBe(62);
  });
});

describe('ownership: the resolver\'s cache and the RPC client', () => {
  const mk = (answer) => {
    let t = T0, calls = 0, a = answer;
    const rpc = { resolve: async () => null, startTrial: async () => null, owns: async () => { calls++; if (a instanceof Error) throw a; return a; } };
    return { c: lib.cachedResolver(rpc, { now: () => t }), calls: () => calls, tick: (ms) => { t += ms; }, set: (x) => { a = x; } };
  };
  it('caches a yes 5 minutes and a no 60 seconds, per token and character (case-insensitive)', async () => {
    const x = mk(true);
    await x.c.owns(TOKEN('a'), 'Aldenmar'); await x.c.owns(TOKEN('a'), 'aldenmar');
    expect(x.calls()).toBe(1);
    await x.c.owns(TOKEN('a'), 'Brackwyn');
    expect(x.calls()).toBe(2);
    x.tick(lib.RESOLVE_HIT_MS + 1); await x.c.owns(TOKEN('a'), 'Aldenmar');
    expect(x.calls()).toBe(3);
    x.set(false);
    x.tick(lib.RESOLVE_HIT_MS + 1);
    expect(await x.c.owns(TOKEN('a'), 'Aldenmar')).toBe(false);
    const n = x.calls();
    x.tick(lib.RESOLVE_MISS_MS - 1); await x.c.owns(TOKEN('a'), 'Aldenmar');
    expect(x.calls()).toBe(n);
    x.tick(2); await x.c.owns(TOKEN('a'), 'Aldenmar');
    expect(x.calls()).toBe(n + 1);
  });
  it('anything but a literal true is a no, and an error is never cached', async () => {
    const x = mk('true');
    expect(await x.c.owns(TOKEN('a'), 'Aldenmar')).toBe(false);
    x.set(new lib.ResolveError('down'));
    await expect(x.c.owns(TOKEN('b'), 'Aldenmar')).rejects.toThrow();
    x.set(true);
    expect(await x.c.owns(TOKEN('b'), 'Aldenmar')).toBe(true);
  });
  it('the RPC client sends the token and the character as the two RPC arguments', async () => {
    const seen = [];
    const rpc = lib.supabaseRpc({ url: 'https://x.supabase.co', anonKey: 'ANON', fetchImpl: async (u, o) => { seen.push([u, o]); return { ok: true, json: async () => true }; } });
    expect(await rpc.owns(TOKEN('a'), 'Aldenmar')).toBe(true);
    expect(seen[0][0]).toBe('https://x.supabase.co/rest/v1/rpc/relay_owns_character');
    expect(JSON.parse(seen[0][1].body)).toEqual({ p_token: TOKEN('a'), p_character: 'Aldenmar' });
  });
});

describe('the ownership migration', () => {
  const raw = fs.readFileSync(path.join(root, 'supabase/migrations/20261115190000_relay_character_owner.sql'), 'utf8');
  const sql = stripSql(raw);
  it('is definer-only, anon-executable, returns a boolean and nothing else', () => {
    expect(sql).toMatch(/create or replace function public\.relay_owns_character\(p_token text, p_character text\)\s+returns boolean/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
    expect(sql).toMatch(/revoke all on function public\.relay_owns_character\(text, text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.relay_owns_character\(text, text\) to anon, service_role/);
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bauthenticated\b/);
    expect(sql).not.toMatch(/return\s+(jsonb|json|query|next)|returns\s+(table|setof|jsonb)/i);
  });
  it('has none of the statements that hang the approval', () => {
    expect(raw).not.toMatch(/\b(delete|drop|truncate)\b/i);
  });
  it('mirrors the resolver\'s session checks and both ownership paths', () => {
    expect(sql).toMatch(/p_token !~ '\^wpms_\[0-9a-f\]\{64\}\$'/);
    expect(sql).toMatch(/s\.revoked_at is not null/);
    expect(sql).toMatch(/s\.scope = 'guest' and \(s\.expires_at is null or s\.expires_at <= now\(\)\)/);
    expect(sql).toMatch(/hc\.name_lc = lower\(p_character\)/);
    expect(sql).toMatch(/hc\.proof <> 'contested'/);
    expect(sql).toMatch(/hp\.deleted_at is null/);
    expect(sql).toMatch(/c\.discord_id = s\.discord_id/);
    expect(sql).toMatch(/lower\(m\.name\) = lower\(c\.main_name\)/);
    expect(sql).toMatch(/m\.discord_id = s\.discord_id/);
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
  // Ownership: by default every hello owns its character; a test sets `owns` to a function/Error to change that.
  let owns = () => true;
  const stub = {
    owns: async (t, c) => { const r = owns(t, c); if (r instanceof Error) throw r; return r; },
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
    owns = () => true;
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
    expect(Object.keys(j).sort()).toEqual(['auto', 'clients', 'ok', 'parties', 'version']);
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

  it('shares timers: each member sees the other\'s, and one cannot publish as the other', async () => {
    const port = await boot();
    const a = client(port); await a.opened;
    hello(a, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
    const w = await next(a, 'welcome');
    const b = client(port); await b.opened;
    hello(b, { token: TOKEN('b'), party: w.party, character: 'Brackwyn' });
    await next(b, 'welcome');
    const at = Date.now();
    a.send(JSON.stringify({ type: 'pub', timers: [{ kind: 'debuff', spell: 'Tashan', target: 'a gnoll', caster: 'Aldenmar', endsAt: at + 5 * 60000 }] }));
    b.send(JSON.stringify({ type: 'pub', timers: [
      { kind: 'charm', spell: 'Allure', target: 'an orc', caster: 'Brackwyn', endsAt: at + 60 * 60000 },
      { kind: 'buff', spell: 'Spoof', target: 'Aldenmar', caster: 'Aldenmar', endsAt: at + 60000 }] }));
    const both = (m) => m.type === 'view' && m.timers.length === 2;
    const va = await until(() => [...a.inbox].reverse().find(both));
    const vb = await until(() => [...b.inbox].reverse().find(both));
    expect(va.timers.map((t) => t.caster).sort()).toEqual(['Aldenmar', 'Brackwyn']);
    expect(vb.timers).toEqual(va.timers);
    expect(va.timers.find((t) => t.spell === 'Allure')).toMatchObject({ kind: 'charm', target: 'an orc', may_break: false });
    expect(va.timers.some((t) => t.spell === 'Spoof')).toBe(false);
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

  describe('auto mode and ownership', () => {
    const pubTo = (c, o) => c.send(JSON.stringify({ type: 'pub', ...o }));
    const autoHello = (c, token, character) => hello(c, { token, auto: true, character });

    it('two auto members who list each other share; a third who lists one of them does not', async () => {
      const port = await boot();
      const a = client(port); await a.opened; autoHello(a, TOKEN('a'), 'Aldenmar');
      const w = await next(a, 'welcome');
      expect(w).toMatchObject({ auto: true, party: null, member: 'Aldenmar' });
      const b = client(port); await b.opened; autoHello(b, TOKEN('b'), 'Brackwyn'); await next(b, 'welcome');
      const c = client(port); await c.opened; autoHello(c, TOKEN('c'), 'Corvale'); await next(c, 'welcome');
      pubTo(a, { members: ['Brackwyn'], perPlayer: { Mob: { dmg: 500, heal: 0, took: 0, threat: 0 } }, timers: [{ kind: 'debuff', spell: 'Tashan', target: 'a gnoll', caster: 'Aldenmar', endsAt: Date.now() + 300000 }] });
      pubTo(b, { members: ['Aldenmar'], perPlayer: { Mob: { dmg: 450, heal: 7, took: 0, threat: 0 } } });
      pubTo(c, { members: ['Aldenmar'], perPlayer: { Other: { dmg: 99, heal: 0, took: 0, threat: 0 } } });     // C lists A, A does not list C
      const va = await until(() => [...a.inbox].reverse().find((m) => m.type === 'view' && m.members === 2 && m.players.length && m.players[0].heal === 7));
      expect(va).toMatchObject({ auto: true, party: null });
      expect(va.players.map((p) => p.name)).toEqual(['Mob']);                     // never Other
      expect(va.players[0]).toMatchObject({ dmg: 500, heal: 7 });
      const vb = await until(() => [...b.inbox].reverse().find((m) => m.type === 'view' && m.members === 2 && m.players.length));
      expect(vb.timers.map((t) => t.spell)).toEqual(['Tashan']);
      const vc = await until(() => [...c.inbox].reverse().find((m) => m.type === 'view' && m.players.length));
      expect(vc.members).toBe(1);
      expect(vc.players.map((p) => p.name)).toEqual(['Other']);
      expect(vc.timers).toEqual([]);
      expect(JSON.stringify([...a.inbox, ...b.inbox, ...c.inbox])).not.toContain('wpms_');
      const j = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      expect(j.auto).toBe(3);
    });

    it('a second connection of the same auto character replaces the first, and history is refused', async () => {
      const port = await boot();
      const a = client(port); await a.opened; autoHello(a, TOKEN('a'), 'Aldenmar'); await next(a, 'welcome');
      const a2 = client(port); await a2.opened; autoHello(a2, TOKEN('a'), 'aldenmar'); await next(a2, 'welcome');
      expect((await next(a, 'error')).code).toBe('replaced');
      a2.send(JSON.stringify({ type: 'history' }));
      expect((await next(a2, 'error')).code).toBe('no_history');
      expect(relay.autos.size).toBe(1);
    });

    it('refuses a character the account does not own, in auto mode and in code mode, and counts it against the IP', async () => {
      owns = (t, c) => c === 'Aldenmar';
      const port = await boot();
      const x = client(port); await x.opened; autoHello(x, TOKEN('a'), 'Brackwyn');
      expect((await next(x, 'error')).code).toBe('not_your_character');
      expect(await x.closed).toBe(4403);
      const y = client(port); await y.opened; hello(y, { token: TOKEN('a'), create: true, character: 'Brackwyn' });
      expect((await next(y, 'error')).code).toBe('not_your_character');
      expect(relay.parties.size).toBe(0);                                          // no party was minted for the spoofer
      const z = client(port); await z.opened; hello(z, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
      expect((await next(z, 'welcome')).tier).toBe('pro');
      expect(relay.autos.size).toBe(0);
    });

    it('does not start a trial for a hello that failed the ownership check', async () => {
      owns = () => false;
      const port = await boot();
      const x = client(port); await x.opened; hello(x, { token: TOKEN('c'), create: true, character: 'Zarrin' });
      expect((await next(x, 'error')).code).toBe('not_your_character');
      expect(trials).toEqual([]);
    });

    it('when the ownership lookup itself fails: auto fails CLOSED, a code party fails OPEN', async () => {
      owns = () => new lib.ResolveError('down');
      const port = await boot();
      const x = client(port); await x.opened; autoHello(x, TOKEN('a'), 'Aldenmar');
      expect((await next(x, 'error')).code).toBe('unavailable');
      expect(await x.closed).toBe(1013);
      expect(relay.autos.size).toBe(0);
      const y = client(port); await y.opened; hello(y, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
      expect((await next(y, 'welcome')).party).toMatch(lib.CODE_RE);
    });

    it('a guest in a code party is not asked to own a character (it has no account); in auto mode it is asked', async () => {
      identities[TOKEN('8')] = { player_id: null, display_name: 'Guest', scope: 'guest', guild_id: 'x', tier: 'free', trial_ends_at: null };
      const asked = [];
      owns = (t, c) => { asked.push(c); return t === TOKEN('a'); };
      const port = await boot();
      const a = client(port); await a.opened; hello(a, { token: TOKEN('a'), create: true, character: 'Aldenmar' });
      const { party } = await next(a, 'welcome');
      asked.length = 0;
      const g = client(port); await g.opened; hello(g, { token: TOKEN('8'), party, character: 'Zarrin' });
      expect((await next(g, 'welcome')).member).toBe('Zarrin');
      expect(asked).toEqual([]);
      const b = client(port); await b.opened; autoHello(b, TOKEN('8'), 'Nyssara');
      expect((await next(b, 'error')).code).toBe('not_your_character');
      expect(asked).toEqual(['Nyssara']);
      delete identities[TOKEN('8')];
    });
  });

  it('the relay never logs or holds a token: index.js and lib.js carry no console output of frames', () => {
    const src = stripJs(fs.readFileSync(path.join(root, 'apps/raidmimic-relay/index.js'), 'utf8'));
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/log\([^)]*token/i);
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
});
