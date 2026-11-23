// test/party-client.test.js — the Mimic / agent half of the Raid Mimic party relay (docs/DESIGN-raidmimic-relay.md).
//
// What can go wrong without anyone noticing: a frame the relay silently drops whole (ONE pet name with a space in a
// perPlayer map, one negative number) so a raider publishes nothing and never knows; a reconnect that mints a new party
// instead of rejoining the old one (the group splits in two); a client that keeps hammering a relay that said
// `replaced` / `party_full` / `unknown_session`; a party that keeps publishing a hidden character, in dry-run, or
// under the fleet kill switch; a hand-rolled WebSocket that mishandles a fragmented, compressed or ping frame; and a
// merge that SUMS the submitters (that one is the relay's, but the end-to-end block below proves it through the client).
//
// Everything is run for real: the pure frame builder is cross-checked against the REAL relay validator, and the
// end-to-end block boots the real relay (apps/raidmimic-relay/index.js, in this process, with a stubbed session
// resolver) and connects two agent clients to it over a real socket. Names are invented.
// Run: npx vitest run test/party-client.test.js

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { readSource, stripJs, AGENT_INDEX, ROOT } from './_source-slice.js';

const require = createRequire(import.meta.url);
const agent = require('../packages/wolfpack-logsync/index.js');
const relayLib = require('../apps/raidmimic-relay/lib.js');
const { createRelay } = require('../apps/raidmimic-relay/index.js');

const TOKEN = (n) => 'wpms_' + String(n).repeat(64).slice(0, 64);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const row = (dmg, o = {}) => ({ dmg, healRaw: 0, took: 0, total: dmg, ...o });

// ── 1. the frame the agent builds ───────────────────────────────────────────────────────────────────────────────
describe('partyBuildPub: a frame the relay will keep', () => {
  const NOW = 1_800_000_000_000;

  it('maps the threat snapshot onto the relay stats: dmg, healRaw as heal, took, total as threat', () => {
    const f = agent.partyBuildPub({ perPlayer: { Aldenmar: { dmg: 1200.4, healRaw: 30, took: 55, total: 99, swing: 7 } } }, NOW);
    expect(f).toEqual({ type: 'pub', perPlayer: { Aldenmar: { dmg: 1200, heal: 30, took: 55, threat: 99 } } });
  });

  it('drops a name the relay would refuse instead of losing the whole frame', () => {
    const f = agent.partyBuildPub({
      perPlayer: { Aldenmar: row(10), 'a skeleton': row(99), 'Brackwyn`s pet': row(98), 'Corvale9': row(97), [`${'x'.repeat(25)}`]: row(96), "O'Brien": row(5) },
    }, NOW);
    expect(Object.keys(f.perPlayer).sort()).toEqual(["Aldenmar", "O'Brien"]);
  });

  it('clamps numbers the relay would refuse (negative, NaN, infinite, over 1e12)', () => {
    const f = agent.partyBuildPub({ perPlayer: { Aldenmar: { dmg: -5, healRaw: NaN, took: Infinity, total: 5e12 }, Brackwyn: { dmg: '77' } } }, NOW);
    expect(f.perPlayer.Aldenmar).toEqual({ dmg: 0, heal: 0, took: 0, threat: 1e12 });
    expect(f.perPlayer.Brackwyn.dmg).toBe(77);
  });

  it('keeps the 80 highest-damage rows when there are more', () => {
    const perPlayer = {};
    for (let i = 0; i < 120; i++) perPlayer['P' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))] = row(i + 1);
    const f = agent.partyBuildPub({ perPlayer }, NOW);
    const names = Object.keys(f.perPlayer);
    expect(names).toHaveLength(80);
    expect(Math.min(...names.map((n) => f.perPlayer[n].dmg))).toBe(41);   // 120 rows of 1..120: the bottom 40 went
  });

  it('cuts text to 120 characters, strips control characters, and drops an empty one', () => {
    const f = agent.partyBuildPub({ perPlayer: { Aldenmar: row(1) }, target: '#' + 'z'.repeat(300), casting: 'Heal\u0000 on\nAldenmar' }, NOW);
    expect(f.target).toHaveLength(120);
    expect(f.target.startsWith('#')).toBe(false);
    expect(f.casting).toBe('Heal  on Aldenmar');
    expect(agent.partyBuildPub({ perPlayer: { Aldenmar: row(1) }, target: '   ', casting: null }, NOW)).not.toHaveProperty('target');
  });

  it('roster: valid names only, HP clamped to 0..100, from hp_pct', () => {
    const f = agent.partyBuildPub({ roster: [{ name: 'Aldenmar', hp_pct: 140 }, { name: 'Brackwyn', hp_pct: -3 }, { name: 'a bear', hp_pct: 50 }, { name: 'Corvale', hp_pct: null }, { name: 'Zarrin', hp_pct: 61.6 }] }, NOW);
    expect(f.roster).toEqual([{ name: 'Aldenmar', hp: 100 }, { name: 'Brackwyn', hp: 0 }, { name: 'Zarrin', hp: 62 }]);
  });

  it('fires: newest 20, never from the future, text cleaned', () => {
    const fires = [];
    for (let i = 0; i < 30; i++) fires.push({ at: NOW - (30 - i) * 1000, name: 'Callout ' + i });
    fires.push({ at: NOW + 99_000, name: 'Future' });
    const f = agent.partyBuildPub({ fires }, NOW);
    expect(f.fires).toHaveLength(20);
    expect(f.fires[19]).toEqual({ text: 'Future', at: NOW });
    expect(f.fires.every((x) => x.at <= NOW)).toBe(true);
  });

  it('is null when there is nothing to say', () => {
    expect(agent.partyBuildPub({}, NOW)).toBeNull();
    expect(agent.partyBuildPub({ perPlayer: { 'a skeleton': row(5) }, roster: [] }, NOW)).toBeNull();
    expect(agent.partyBuildPub(null, NOW)).toBeNull();
  });

  it('the REAL relay validator accepts a hostile mix once built (and refuses the raw one)', () => {
    const hostile = {
      perPlayer: { Aldenmar: row(10), 'a skeleton': row(5), Brackwyn: { dmg: -1, healRaw: NaN, took: 1e15, total: 3 } },
      target: 'x'.repeat(500), casting: 'ok\u0007',
      roster: [{ name: 'Aldenmar', hp_pct: 250 }, { name: 'a bear', hp_pct: 5 }],
      fires: [{ at: NOW + 5000, name: 'y'.repeat(400) }],
    };
    const raw = { type: 'pub', perPlayer: hostile.perPlayer };
    expect(relayLib.validatePub(raw, NOW).ok).toBe(false);
    const built = agent.partyBuildPub(hostile, NOW);
    const v = relayLib.validatePub(JSON.parse(JSON.stringify(built)), NOW);
    expect(v.ok, v.reason).toBe(true);
    expect(v.pub.perPlayer.size).toBe(2);
    expect(JSON.stringify(built).length).toBeLessThan(relayLib.MAX_FRAME_BYTES);
  });

  it('a full 80-row, 80-roster, 20-fire frame stays under the relay\'s 32 KB cap', () => {
    const perPlayer = {}, roster = [], fires = [];
    for (let i = 0; i < 80; i++) { const n = 'Player' + String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26)); perPlayer[n.replace(/\d/g, '')] = row(1e9 + i, { healRaw: 1e9, took: 1e9, total: 1e9 }); roster.push({ name: n, hp_pct: 77 }); }
    for (let i = 0; i < 20; i++) fires.push({ at: NOW - i, name: 'f'.repeat(120) });
    const f = agent.partyBuildPub({ perPlayer, roster, fires, target: 't'.repeat(120), casting: 'c'.repeat(120) }, NOW);
    const bytes = Buffer.byteLength(JSON.stringify(f));
    expect(bytes).toBeLessThan(relayLib.MAX_FRAME_BYTES);
    expect(relayLib.validatePub(JSON.parse(JSON.stringify(f)), NOW).ok).toBe(true);
  });
});

// ── 2. backoff ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('partyBackoffMs', () => {
  it('walks 1, 2, 5, 10, 20, 30, 60 seconds and then stays at 60', () => {
    const got = [0, 1, 2, 3, 4, 5, 6, 7, 20].map((n) => agent.partyBackoffMs(n, () => 0));
    expect(got).toEqual([1000, 2000, 5000, 10000, 20000, 30000, 60000, 60000, 60000]);
    expect(agent.PARTY_BACKOFF_MS).toEqual([1000, 2000, 5000, 10000, 20000, 30000, 60000]);
  });
  it('adds up to 20% jitter, and never waits less than the floor a slow_down asks for', () => {
    expect(agent.partyBackoffMs(2, () => 1)).toBe(6000);
    expect(agent.partyBackoffMs(0, () => 0, 30_000)).toBe(30_000);
    expect(agent.partyBackoffMs(-4, () => 0)).toBe(1000);
  });
});

// ── 3. the state machine, driven by hand ────────────────────────────────────────────────────────────────────────
class FakeWS {
  constructor(url, opts) { this.url = url; this.opts = opts; this.sent = []; this.readyState = 1; this.closed = null; FakeWS.all.push(this); }
  sendText(t) { this.sent.push(JSON.parse(t)); return true; }
  close(code) { this.closed = code || 1000; this.readyState = 3; }
  terminate() { this.closed = this.closed || 1006; this.readyState = 3; }
  open() { this.onopen && this.onopen(); }
  say(o) { this.onmessage && this.onmessage(JSON.stringify(o)); }
  drop() { this.readyState = 3; this.onclose && this.onclose({ code: 1006, reason: 'closed' }); }
}
FakeWS.all = [];

describe('the party client state machine', () => {
  let t, blocked, collected, store, saved;
  const mk = (over = {}) => agent.createPartyClient({
    url: () => 'ws://fake/v1/party', WS: FakeWS, getToken: () => TOKEN('a'), getCharacter: () => 'Aldenmar', blocked: () => blocked,
    collect: () => collected, version: '4.0.87', now: () => t, pubMs: 2000, rand: () => 0,
    store: { load: () => store, save: (o) => { saved.push(o); } }, ...over,
  });
  beforeEach(() => { vi.useFakeTimers(); t = 1_800_000_000_000; blocked = null; collected = null; store = null; saved = []; FakeWS.all = []; });
  afterEach(() => { vi.useRealTimers(); });
  const advance = (ms) => { t += ms; vi.advanceTimersByTime(ms); };
  const last = () => FakeWS.all[FakeWS.all.length - 1];

  it('creates: hello carries the session token, the character and create:true; welcome joins and remembers the code', () => {
    const c = mk();
    expect(c.create()).toEqual({ ok: true });
    const w = last(); w.open();
    expect(w.sent[0]).toEqual({ type: 'hello', token: TOKEN('a'), character: 'Aldenmar', agent_version: '4.0.87', create: true });
    expect(w.opts.headers['User-Agent']).toBe('wolfpack-logsync/4.0.87');
    w.say({ type: 'welcome', party: 'K7M2QX', tier: 'trial', member: 'Aldenmar' });
    expect(c.status()).toMatchObject({ status: 'joined', code: 'K7M2QX', tier: 'trial' });
    expect(saved[saved.length - 1]).toMatchObject({ code: 'K7M2QX' });
  });

  it('joins by code (any case, spaces and a dash ignored) and refuses a malformed one without connecting', () => {
    const c = mk();
    expect(c.join('k7m-2qx').ok).toBe(true);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', party: 'K7M2QX' });
    expect(last().sent[0]).not.toHaveProperty('create');
    FakeWS.all = [];
    const bad = mk();
    for (const code of ['', 'ABC', 'K7M2QO', 'K7M2QXX', null]) expect(bad.join(code).ok).toBe(false);
    expect(FakeWS.all).toHaveLength(0);
  });

  it('a reconnect JOINS the party it was in; it never creates a second one', () => {
    const c = mk();
    c.create(); last().open(); last().say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    last().drop();
    expect(c.status().status).toBe('reconnecting');
    advance(1000);
    const w = last(); w.open();
    expect(w.sent[0]).toMatchObject({ type: 'hello', party: 'K7M2QX' });
    expect(w.sent[0]).not.toHaveProperty('create');
  });

  it('backs off 1, 2, 5 s between failed attempts and resets after a welcome', () => {
    const c = mk();
    c.join('K7M2QX');
    const waits = [];
    for (let i = 0; i < 3; i++) { last().drop(); waits.push(c.status().retry_in_ms); advance(waits[i]); }
    expect(waits).toEqual([1000, 2000, 5000]);
    last().open(); last().say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    last().drop();
    expect(c.status().retry_in_ms).toBe(1000);
  });

  for (const code of ['replaced', 'party_full', 'unknown_session', 'no_party', 'bad_token']) {
    it(`stops for good on ${code}, with a plain message, and does not reconnect`, () => {
      const c = mk();
      c.join('K7M2QX'); last().open();
      const n = FakeWS.all.length;
      last().say({ type: 'error', code });
      last().drop();
      advance(120_000);
      expect(FakeWS.all).toHaveLength(n);
      const s = c.status();
      expect(s.status).toBe('ended');
      expect(s.error.code).toBe(code);
      expect(s.error.message).toBe(agent.PARTY_FATAL[code]);
      expect(s.error.message.length).toBeGreaterThan(20);
      expect(saved[saved.length - 1]).toBeNull();           // nothing remembered: a restart does not rejoin it
    });
  }

  it('slow_down and busy are retried, and slow_down waits at least 30 s', () => {
    const c = mk();
    c.join('K7M2QX'); last().open();
    last().say({ type: 'error', code: 'slow_down' });
    expect(c.status().status).toBe('reconnecting');
    expect(c.status().retry_in_ms).toBeGreaterThanOrEqual(30_000);
    advance(30_000);
    expect(FakeWS.all).toHaveLength(2);
    last().open(); last().say({ type: 'error', code: 'busy' });
    expect(c.status().status).toBe('reconnecting');
  });

  it('publishes every 2 s once joined, only what collect() returned, and nothing when it has nothing', () => {
    const c = mk();
    c.join('K7M2QX'); const w = last(); w.open(); w.say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    w.say({ type: 'view', party: 'K7M2QX', tier: 'free', members: 1, players: [], roster: [], fires: [] });
    advance(2000);
    expect(w.sent.filter((m) => m.type === 'pub')).toHaveLength(0);          // collect() was null: not fighting, not grouped
    collected = { perPlayer: { Aldenmar: row(500) }, roster: [{ name: 'Aldenmar', hp_pct: 90 }] };
    w.say({ type: 'view', party: 'K7M2QX', tier: 'free', members: 1, players: [], roster: [], fires: [] });
    advance(2000);
    const pubs = w.sent.filter((m) => m.type === 'pub');
    expect(pubs).toHaveLength(1);
    expect(pubs[0].perPlayer.Aldenmar.dmg).toBe(500);
    expect(JSON.stringify(w.sent)).not.toMatch(/"token":"(?!wpms_)/);
  });

  it('keeps the latest view for the HUD, with the tier and the trial end', () => {
    const c = mk();
    c.join('K7M2QX'); const w = last(); w.open(); w.say({ type: 'welcome', party: 'K7M2QX', tier: 'trial' });
    w.say({ type: 'view', party: 'K7M2QX', tier: 'trial', trial_ends_at: '2026-11-29T00:00:00Z', members: 3, players: [{ name: 'Corvale', dmg: 9, heal: 0, took: 0, threat: 1, age_ms: { dmg: 10 } }], roster: [], fires: [], target: 'a bear', stale: false });
    expect(c.status()).toMatchObject({ members: 3, tier: 'trial', trial_ends_at: '2026-11-29T00:00:00Z', stale: false });
    expect(c.view().players[0].name).toBe('Corvale');
    expect(c.view().target).toBe('a bear');
  });

  it('a socket that goes silent for 15 s is dropped and rejoined', () => {
    const c = mk();
    c.join('K7M2QX'); last().open(); last().say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    for (let i = 0; i < 14; i++) advance(1000);
    expect(c.status().status).toBe('joined');            // 14 s of silence is not yet a dead socket
    expect(FakeWS.all).toHaveLength(1);
    for (let i = 0; i < 4; i++) advance(1000);
    expect(FakeWS.all).toHaveLength(2);                  // past 15 s: dropped, then a second socket after the 1 s backoff
    expect(FakeWS.all[0].closed).not.toBeNull();
  });

  it('stands down (closes the socket, publishes nothing) while blocked, and resumes by itself', () => {
    const c = mk();
    c.join('K7M2QX'); const w = last(); w.open(); w.say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    collected = { perPlayer: { Aldenmar: row(5) } };
    blocked = 'control';
    advance(2000);
    expect(c.status()).toMatchObject({ status: 'paused', paused_for: 'control' });
    expect(c.status().paused_text).toMatch(/control plane/);
    expect(w.closed).not.toBeNull();
    expect(w.sent.filter((m) => m.type === 'pub')).toHaveLength(0);
    blocked = null;
    advance(2000);
    expect(FakeWS.all).toHaveLength(2);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', party: 'K7M2QX' });
  });

  it('refuses to start while blocked, with the reason in words', () => {
    const c = mk();
    blocked = 'dry_run';
    const r = c.create();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dry_run');
    expect(r.error).toMatch(/Dry-run/);
    expect(FakeWS.all).toHaveLength(0);
  });

  it('with no sign-in or no character it waits instead of connecting', () => {
    const c = mk({ getToken: () => '' });
    c.join('K7M2QX');
    expect(c.status()).toMatchObject({ status: 'paused', paused_for: 'signed_out' });
    expect(FakeWS.all).toHaveLength(0);
    const d = mk({ getCharacter: () => null });
    d.join('K7M2QX');
    expect(d.status().paused_for).toBe('no_character');
  });

  it('leave says bye, closes, forgets the code and stops reconnecting', () => {
    const c = mk();
    c.join('K7M2QX'); const w = last(); w.open(); w.say({ type: 'welcome', party: 'K7M2QX', tier: 'free' });
    c.leave();
    expect(w.sent[w.sent.length - 1]).toEqual({ type: 'bye' });
    expect(w.closed).not.toBeNull();
    expect(c.status().status).toBe('off');
    expect(saved[saved.length - 1]).toBeNull();
    advance(120_000);
    expect(FakeWS.all).toHaveLength(1);
  });

  it('resume() rejoins a code remembered under 4 hours, and ignores an old or malformed one', () => {
    store = { code: 'K7M2QX', at: t - 3600_000 };
    expect(mk().resume()).toBe(true);
    expect(last().url).toBe('ws://fake/v1/party');
    for (const bad of [{ code: 'K7M2QX', at: t - 5 * 3600_000 }, { code: 'nope', at: t }, null]) { store = bad; expect(mk().resume()).toBe(false); }
  });

  it('events from a replaced socket are ignored (a late close never starts a second reconnect)', () => {
    const c = mk();
    c.join('K7M2QX'); const first = last(); first.open();
    c.leave(); c.join('K7M2QX');
    const n = FakeWS.all.length;
    first.drop();
    advance(10_000);
    expect(FakeWS.all).toHaveLength(n);
  });
});

// ── 4. the agent's wiring: who may publish, and the local route ─────────────────────────────────────────────────
describe('agent wiring', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-party-')); agent._partySetFileForTest(path.join(dir, 'party.json')); agent._partyResetForTest(); agent._setMimicSessionForTest(''); agent._setUploadOptsForTest(null); agent._partyCharacterForTest('Aldenmar'); });
  afterEach(() => { agent._partyResetForTest(); agent._partySetFileForTest(null); agent._partyCharacterForTest(null); agent._setMimicSessionForTest(''); agent._setUploadOptsForTest(null); agent._applyCharacterPrefsResponse({ prefs: {} }); fs.rmSync(dir, { recursive: true, force: true }); });

  it('the stand-down reasons, in order: dry-run, no session, hidden character', () => {
    expect(agent._partyBlocked()).toBe('signed_out');
    agent._setMimicSessionForTest(TOKEN('a'));
    expect(agent._partyBlocked()).toBeNull();
    agent._setUploadOptsForTest({ token: 't', botUrl: 'https://x/api/agent/encounter', dryRun: true });
    expect(agent._partyBlocked()).toBe('dry_run');
    agent._setUploadOptsForTest(null);
    agent._applyCharacterPrefsResponse({ prefs: { aldenmar: { exclude_from_stats: true } } });
    expect(agent._partyBlocked()).toBe('hidden');
    agent._applyCharacterPrefsResponse({ prefs: {} });
  });

  it('the fleet kill switch stands the party down', () => {
    agent._setMimicSessionForTest(TOKEN('a'));
    agent._applyControlPlane({ agent_kill: true }, 'test');
    expect(agent._partyBlocked()).toBe('control');
    agent._applyControlPlane({ agent_kill: false }, 'test');
    expect(agent._partyBlocked()).toBeNull();
  });

  it('a guest character is never shared', () => {
    agent._setMimicSessionForTest(TOKEN('a'));
    agent.setGuestCharacter('Aldenmar', true);
    try { expect(agent._partyBlocked()).toBe('hidden'); } finally { agent.setGuestCharacter('Aldenmar', false); }
  });

  it('collects nothing when this PC is neither fighting nor in a group or raid', () => {
    expect(agent._partyCollect()).toBeNull();
  });

  it('in a group: the group bars, the target and ONLY guild trigger fires (a personal trigger\'s name stays here)', () => {
    const now = Date.now();
    agent._setZealStateForTest('Aldenmar', { updatedAt: now, target_name: '#a bear', gauges: [
      { slot: 11, text: 'Brackwyn', hp_pct: 70 }, { slot: 12, text: 'Corvale', hp_pct: 31 }, { slot: 6, text: 'a bear', hp_pct: 88 } ] });
    const log = agent._fireLog;
    log.length = 0;
    log.push({ at: now - 1000, name: 'Guild callout', guild: true }, { at: now - 900, name: 'My private reminder', guild: false }, { at: now - 120_000, name: 'Too old', guild: true });
    try {
      const src = agent._partyCollect();
      expect(src.roster).toEqual([{ name: 'Brackwyn', hp_pct: 70 }, { name: 'Corvale', hp_pct: 31 }]);
      expect(src.target).toBe('#a bear');
      expect(src.fires.map((f) => f.name)).toEqual(['Guild callout']);
      const frame = agent.partyBuildPub(src, now);
      expect(frame.target).toBe('a bear');
      expect(JSON.stringify(frame)).not.toContain('private');
    } finally { log.length = 0; agent._setZealStateForTest('Aldenmar', null); }
  });

  const res = () => { const r = { status: 0, body: '' }; r.writeHead = (s) => { r.status = s; }; r.setHeader = () => {}; r.end = (b) => { r.body = b; }; r.json = () => JSON.parse(r.body); return r; };
  const req = (method, url, body) => Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers: {} });

  it('GET /api/party with no party answers off; other paths are not its business', async () => {
    const r = res();
    expect(await agent._partyRoute(req('GET', '/api/party'), r)).toBe(true);
    expect(r.json()).toMatchObject({ ok: true, status: 'off' });
    expect(await agent._partyRoute(req('GET', '/api/state'), res())).toBe(false);
    expect(agent._partyStateForDashboard()).toBeNull();
  });

  it('POST validates the action, the code and the sign-in, with a message for each', async () => {
    let r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"explode"}'), r); expect(r.status).toBe(400);
    r = res(); await agent._partyRoute(req('POST', '/api/party', 'not json'), r); expect(r.status).toBe(400);
    r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"create"}'), r);
    expect(r.status).toBe(400); expect(r.json()).toMatchObject({ ok: false, reason: 'signed_out' }); expect(r.json().error).toMatch(/Sign in with Discord/);
    agent._setMimicSessionForTest(TOKEN('a'));
    r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"join","code":"zzz"}'), r);
    expect(r.status).toBe(400); expect(r.json().error).toMatch(/6 letters or numbers/);
    r = res(); await agent._partyRoute(req('DELETE', '/api/party'), r); expect(r.status).toBe(405);
  });
});

// ── 5. the WebSocket client, against hand-made frames ───────────────────────────────────────────────────────────
// A bare TCP server that does the upgrade by hand, then writes whatever frames a test hands it.
function rawServer(handler, { badAccept = false } = {}) {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0), done = false;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!done) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        buf = buf.subarray(end + 4); done = true;
        const key = /sec-websocket-key: (.+)/i.exec(head)[1].trim();
        const accept = badAccept ? 'AAAA' : crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        sock.head = head; handler(sock, head);
      }
      sock.rx = buf;
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}
const frame = (op, payload, { fin = true, rsv1 = false } = {}) => {
  const p = Buffer.from(payload);
  const head = p.length < 126 ? Buffer.from([(fin ? 0x80 : 0) | (rsv1 ? 0x40 : 0) | op, p.length]) : Buffer.from([(fin ? 0x80 : 0) | (rsv1 ? 0x40 : 0) | op, 126, p.length >> 8, p.length & 255]);
  return Buffer.concat([head, p]);
};
// What the client wrote: unmask every frame it sent.
function clientFrames(buf) {
  const out = [];
  for (let i = 0; i + 2 <= buf.length;) {
    const op = buf[i] & 0x0f, masked = (buf[i + 1] & 0x80) !== 0; let len = buf[i + 1] & 0x7f, off = i + 2;
    if (len === 126) { len = buf.readUInt16BE(off); off += 2; }
    const mask = masked ? buf.subarray(off, off + 4) : null; if (masked) off += 4;
    const body = Buffer.from(buf.subarray(off, off + len)); if (mask) for (let k = 0; k < len; k++) body[k] ^= mask[k & 3];
    out.push({ op, masked, body }); i = off + len;
  }
  return out;
}

describe('MiniWebSocket (RFC 6455, zero dependencies)', () => {
  const open = [];
  afterEach(async () => { for (const [ws, srv] of open.splice(0)) { try { ws.terminate(); } catch { /* gone */ } srv.close(); } });
  const dial = async (handler, opts) => {
    const { server, port } = await rawServer(handler, opts);
    const ws = new agent.MiniWebSocket(`ws://127.0.0.1:${port}/v1/party`);
    ws.inbox = []; ws.onmessage = (m) => ws.inbox.push(m); ws.closed = new Promise((r) => { ws.onclose = r; }); ws.errors = []; ws.onerror = (e) => ws.errors.push(e.message);
    open.push([ws, server]);
    return ws;
  };
  const until = async (fn, ms = 2000) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)); } };

  it('upgrades, sends masked text frames, and reads text frames (short and 16-bit length)', async () => {
    const ws = await dial((s) => { s.write(frame(1, 'hello')); s.write(frame(1, 'x'.repeat(300))); });
    ws.onopen = () => ws.sendText('{"type":"hello"}');
    await until(() => ws.inbox.length === 2);
    expect(ws.inbox[0]).toBe('hello');
    expect(ws.inbox[1]).toHaveLength(300);
  });

  it('every client frame is masked, and the Host and key headers are right', async () => {
    let sock;
    const ws = await dial((s) => { sock = s; });
    ws.onopen = () => ws.sendText('{"a":1}');
    await until(() => sock && sock.rx && sock.rx.length);
    const f = clientFrames(sock.rx);
    expect(f[0]).toMatchObject({ op: 1, masked: true });
    expect(f[0].body.toString()).toBe('{"a":1}');
    expect(sock.head).toMatch(/^GET \/v1\/party HTTP\/1\.1/);
    expect(sock.head).toMatch(/Sec-WebSocket-Version: 13/);
    expect(sock.head).not.toMatch(/Origin:/i);
  });

  it('answers a ping with a pong carrying the same bytes', async () => {
    let sock;
    const ws = await dial((s) => { sock = s; s.write(frame(9, 'beat')); });
    await until(() => sock && sock.rx && sock.rx.length);
    expect(clientFrames(sock.rx)[0]).toMatchObject({ op: 10, masked: true });
    expect(clientFrames(sock.rx)[0].body.toString()).toBe('beat');
    void ws;
  });

  it('joins a fragmented message, with a ping in the middle', async () => {
    const ws = await dial((s) => { s.write(frame(1, 'abc', { fin: false })); s.write(frame(9, '')); s.write(frame(0, 'def', { fin: false })); s.write(frame(0, 'ghi')); });
    await until(() => ws.inbox.length);
    expect(ws.inbox).toEqual(['abcdefghi']);
  });

  it('reads a permessage-deflate message when the server negotiated it', async () => {
    const json = JSON.stringify({ type: 'view', players: Array.from({ length: 40 }, (_, i) => ({ name: 'Player' + i, dmg: i })) });
    const raw = zlib.deflateRawSync(Buffer.from(json), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    const body = raw.subarray(0, raw.length - 4);       // the 00 00 ff ff tail is not sent
    // This server answers the extension offer, which the helper's plain 101 does not: use a custom handshake.
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (buf.indexOf('\r\n\r\n') < 0) return;
        const key = /sec-websocket-key: (.+)/i.exec(buf.toString())[1].trim();
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover\r\n\r\n`);
        const len = body.length;
        sock.write(Buffer.concat([Buffer.from([0xc1, 126, len >> 8, len & 255]), body]));
        buf = Buffer.alloc(0);
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const ws = new agent.MiniWebSocket(`ws://127.0.0.1:${server.address().port}/v1/party`);
    ws.inbox = []; ws.onmessage = (m) => ws.inbox.push(m);
    open.push([ws, server]);
    await until(() => ws.inbox.length);
    expect(JSON.parse(ws.inbox[0]).players).toHaveLength(40);
  });

  it('refuses an upgrade whose accept key is wrong, and reports it once as an error plus a close', async () => {
    const ws = await dial(() => {}, { badAccept: true });
    const c = await ws.closed;
    expect(c.code).toBe(1006);
    expect(ws.errors[0]).toMatch(/upgrade refused/);
    expect(ws.readyState).toBe(3);
  });

  it('closes on a server-masked frame and on a frame over its size cap, without delivering either', async () => {
    const masked = Buffer.concat([Buffer.from([0x81, 0x85, 1, 2, 3, 4]), Buffer.from('hello')]);
    const ws = await dial((s) => { s.write(masked); });
    await ws.closed;
    expect(ws.inbox).toEqual([]);
  });

  it('a close frame is echoed and reported with its code', async () => {
    let sock;
    const ws = await dial((s) => { sock = s; s.write(frame(8, Buffer.from([0x0f, 0xa0, ...Buffer.from('bye')]))); });   // 4000 'bye'
    const c = await ws.closed;
    expect(c).toMatchObject({ code: 4000, reason: 'bye' });
    await until(() => sock.rx && sock.rx.length);
    expect(clientFrames(sock.rx)[0].op).toBe(8);
  });

  it('does not connect to a port nobody listens on: an error and a close, never an exception', async () => {
    const closed = await new Promise((resolve) => {
      const ws = new agent.MiniWebSocket('ws://127.0.0.1:9/v1/party');
      ws.onerror = () => {}; ws.onclose = resolve;
    });
    expect(closed.code).toBe(1006);
  });
});

// ── 6. end to end against the REAL relay ────────────────────────────────────────────────────────────────────────
describe('end to end: two agent clients through the real relay', () => {
  const identities = {};
  const stub = {
    resolve: async (t) => identities[t] || null,
    startTrial: async (t) => { identities[t] = { ...identities[t], tier: 'trial', trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString() }; return identities[t].trial_ends_at; },
  };
  let relay, port;
  const clients = [];
  const until = async (fn, ms = 4000) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 15)); } };
  const mk = (n, character, data, over = {}) => {
    const c = agent.createPartyClient({ url: () => `ws://127.0.0.1:${port}/v1/party`, getToken: () => TOKEN(n), getCharacter: () => character, blocked: () => null, collect: () => data.v, version: '4.0.87', pubMs: 100, rand: () => 0, ...over });
    clients.push(c);
    return c;
  };
  beforeEach(async () => {
    for (const k of Object.keys(identities)) delete identities[k];
    identities[TOKEN('a')] = { player_id: 'pa', display_name: 'A', scope: 'member', guild_id: 'wolfpack', hub_plan: null, tier: 'pro', trial_ends_at: null };
    identities[TOKEN('b')] = { player_id: 'pb', display_name: 'B', scope: 'player', guild_id: '~player', hub_plan: null, tier: 'free', trial_ends_at: null };
    relay = createRelay({ rpc: stub, quiet: true, viewEveryMs: 60 });
    port = await relay.start(0, '127.0.0.1');
  });
  afterEach(async () => { for (const c of clients.splice(0)) c.destroy(); await relay.stop(); });

  it('one creates, the other joins by the code; each sees the other\'s numbers, max-merged and not summed', async () => {
    const da = { v: { perPlayer: { Corvale: row(500, { healRaw: 0, took: 7, total: 40 }), Zarrin: row(100) }, roster: [{ name: 'Aldenmar', hp_pct: 90 }], target: 'a bear', fires: [{ at: Date.now(), name: 'Root broke' }] } };
    const db = { v: { perPlayer: { Corvale: row(450, { healRaw: 5, took: 7, total: 60 }), Zarrin: row(120) }, roster: [{ name: 'Brackwyn', hp_pct: 55 }] } };
    const a = mk('a', 'Aldenmar', da), b = mk('b', 'Brackwyn', db);
    expect(a.create().ok).toBe(true);
    await until(() => a.status().code);
    expect(a.status()).toMatchObject({ status: 'joined', tier: 'pro' });
    expect(b.join(a.status().code.toLowerCase()).ok).toBe(true);
    await until(() => b.status().status === 'joined');
    const merged = (c) => { const v = c.view(); return v && v.players.length === 2 && v.roster.length === 2 && v.players.find((p) => p.name === 'Corvale').heal === 5 && c.status().members === 2 ? v : null; };
    const va = await until(() => merged(a)), vb = await until(() => merged(b));
    for (const v of [va, vb]) {
      const c = v.players.find((p) => p.name === 'Corvale'), z = v.players.find((p) => p.name === 'Zarrin');
      expect(c).toMatchObject({ dmg: 500, heal: 5, took: 7, threat: 60 });     // max of each stat, never 950
      expect(z.dmg).toBe(120);
      expect(v.roster.map((r) => r.name)).toEqual(['Aldenmar', 'Brackwyn']);
      expect(v.target).toBe('a bear');
      expect(v.fires[0].text).toBe('Root broke');
    }
    expect(a.status().tier).toBe('pro');                 // a Wolf Pack member lifts the whole party
    expect(b.status().tier).toBe('pro');
    expect(a.status().stale).toBe(false);
  });

  it('a big merged view (compressed on the wire) still arrives whole', async () => {
    const perPlayer = {};
    for (let i = 0; i < 70; i++) perPlayer['Raider' + 'abcdefghijklmnopqrstuvwxyz'[i % 26] + 'abc'[Math.floor(i / 26)]] = row(1000 + i);
    const a = mk('a', 'Aldenmar', { v: { perPlayer } });
    a.create();
    const v = await until(() => { const x = a.view(); return x && x.players.length === 70 ? x : null; });
    expect(v.players).toHaveLength(70);
  });

  it('the same player joining twice replaces the first connection: the first stops for good with `replaced`', async () => {
    const a1 = mk('a', 'Aldenmar', { v: null });
    a1.create();
    const code = await until(() => a1.status().code);
    const a2 = mk('a', 'Aldenmar', { v: null });
    a2.join(code);
    await until(() => a2.status().status === 'joined');
    await until(() => a1.status().status === 'ended');
    expect(a1.status().error.code).toBe('replaced');
    await new Promise((r) => setTimeout(r, 1300));
    expect(a1.status().status).toBe('ended');            // no reconnect storm
    expect(a2.status().status).toBe('joined');
  });

  it('an unknown session ends with unknown_session; a code nobody holds ends with no_party', async () => {
    const stranger = mk('c', 'Corvale', { v: null });
    stranger.create();
    await until(() => stranger.status().status === 'ended');
    expect(stranger.status().error.code).toBe('unknown_session');
    const a = mk('a', 'Aldenmar', { v: null });
    a.join('K7M2QX');
    await until(() => a.status().status === 'ended');
    expect(a.status().error.code).toBe('no_party');
  });

  it('when the relay drops the sockets, both clients come back into the SAME party and keep merging', async () => {
    const da = { v: { perPlayer: { Corvale: row(500) } } }, db = { v: { perPlayer: { Zarrin: row(70) } } };
    const a = mk('a', 'Aldenmar', da), b = mk('b', 'Brackwyn', db);
    a.create(); const code = await until(() => a.status().code);
    b.join(code); await until(() => b.status().status === 'joined');
    await until(() => a.view() && a.view().players.length === 2);
    for (const ws of [...relay.clients]) ws.terminate();
    await until(() => a.status().status !== 'joined');
    const v = await until(() => { const x = a.view(); return a.status().status === 'joined' && b.status().status === 'joined' && a.status().members === 2 && x && x.players.length === 2 ? x : null; }, 6000);
    expect(a.status().code).toBe(code);
    expect(relay.parties.size).toBe(1);
    expect(v.players.map((p) => p.name).sort()).toEqual(['Corvale', 'Zarrin']);
  });

  it('leaving takes the member out of the party at once', async () => {
    const a = mk('a', 'Aldenmar', { v: null }), b = mk('b', 'Brackwyn', { v: null });
    a.create(); const code = await until(() => a.status().code);
    b.join(code); await until(() => a.status().members === 2);
    b.leave();
    await until(() => a.status().members === 1);
    expect(b.status().status).toBe('off');
  });
});

// ── 7. the surfaces (text, comments stripped) ───────────────────────────────────────────────────────────────────
describe('the surfaces carry it', () => {
  const agentSrc = stripJs(readSource(AGENT_INDEX));
  const dash = read('packages/wolfpack-logsync/dashboard.html');
  const overlay = read('apps/mimic/overlay.html');

  it('the agent serves /api/party from the dashboard router and puts partyView on /api/state', () => {
    expect(agentSrc).toMatch(/if \(await _partyRoute\(req, res\)\) return;/);
    expect(agentSrc).toMatch(/partyView:\s+_partyStateForDashboard\(\)/);
  });

  it('only guild trigger fires are shared: a personal trigger\'s name stays on this PC', () => {
    expect(agentSrc).toMatch(/_fireLog\.push\(\{[^}]*guild: t\._scope !== 'personal'/);
    expect(agentSrc).toMatch(/_fireLog\.filter\(\(f\) => f\.guild/);
  });

  it('the dashboard card exists once, is filled in order, and has create / join / leave', () => {
    expect(dash.match(/id="wpParty"/g)).toHaveLength(1);
    expect(dash).toMatch(/\['party', renderPartyCard\]/);
    for (const fn of ['wpPtCreate', 'wpPtJoin', 'wpPtLeave', 'wpPtCopy', 'wpPartyOpen']) expect(dash).toContain('function ' + fn);
    expect(dash).toMatch(/action: 'create'/);
    expect(dash).toMatch(/'#party'/);
    expect(dash).toMatch(/Pro trial/);                   // the tier is only a small tag
  });

  it('the card prints nothing that ticks (byte-stable between polls)', () => {
    const card = dash.slice(dash.indexOf('function wpPtHtml'), dash.indexOf('function wpPtRepaint'));
    expect(card).not.toMatch(/view_age_ms|retry_in_ms|fmtAgo|toLocaleTimeString/);
  });

  it('the DPS HUD has a Party switch with the hover handshake, age dots, and Tank reads took', () => {
    expect(overlay).toMatch(/id="tabParty"/);
    expect(overlay).toMatch(/tabPartyBtn\.addEventListener\('mouseenter'[^\n]*overlayHoverInteractive\(true\)/);
    expect(overlay).toMatch(/tabPartyBtn\.addEventListener\('mouseleave'[^\n]*overlayHoverInteractive\(false\)/);
    expect(overlay).toMatch(/var _pf = isTank \? 'took' : 'dmg';/);
    expect(overlay).toMatch(/s\.partyView/);
    expect(overlay).toMatch(/function _ageDot/);
  });

  it('the tray and Settings open the same card (tray <-> dashboard parity)', () => {
    const main = stripJs(read('apps/mimic/main.js'));
    expect(main).toMatch(/\.\.\._partyTrayItems\(\),/);
    expect(main).toMatch(/showDashboardTab\('party'\)/);
    expect(main).toMatch(/ipcMain\.handle\('open-party-card'/);
    expect(stripJs(read('apps/mimic/preload.js'))).toMatch(/openPartyCard:\s+\(\)\s+=> ipcRenderer\.invoke\('open-party-card'\)/);
    expect(read('apps/mimic/settings.html')).toMatch(/window\.mimic\.openPartyCard\(\)/);
  });

  it('no overlay window was added (the party rides the existing DPS HUD)', () => {
    const main = stripJs(read('apps/mimic/main.js'));
    expect(main).not.toMatch(/party\.html/);
    expect(fs.existsSync(path.join(ROOT, 'apps/mimic/party.html'))).toBe(false);
  });
});

// ── 8. auto mode: follow the real in-game group and raid (the guild lead, 2026-11-15) ───────────────────────────
// "where we check session against zeal pipes party members": hello {auto:true} with no code, `members` on every frame,
// leave after 2 minutes alone or when the setting is off, stop for good on `not_your_character`. Names are invented.
describe('auto mode: the members list', () => {
  it('puts self first, then the raid, then the group, each name once (any case), invalid names dropped', () => {
    const out = agent.partyMembersList('Aldenmar', [{ name: 'Brackwyn' }, { name: 'aldenmar' }, 'Corvale'], ['corvale', 'Zarrin', 'a skeleton', 'Pet9', '', null, "O'Brien", 'x'.repeat(25)]);
    expect(out).toEqual(['Aldenmar', 'Brackwyn', 'Corvale', 'Zarrin', "O'Brien"]);
  });
  it('caps the list at 72', () => {
    const many = []; for (let i = 0; i < 120; i++) many.push('P' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));
    const out = agent.partyMembersList('Aldenmar', many);
    expect(out).toHaveLength(72);
    expect(out[0]).toBe('Aldenmar');
    expect(agent.PARTY_MAX_MEMBERS).toBe(72);
  });
  it('a frame carries `members` (validated again) and a frame of only members is still sent', () => {
    expect(agent.partyBuildPub({ members: ['Aldenmar', 'Brackwyn', 'a bear', 'Aldenmar'] }, 1_800_000_000_000)).toEqual({ type: 'pub', members: ['Aldenmar', 'Brackwyn'] });
    expect(agent.partyBuildPub({ members: ['a bear'] }, 1_800_000_000_000)).toBeNull();
    expect(agent.partyBuildPub({ perPlayer: { Aldenmar: row(5) } }, 1_800_000_000_000)).not.toHaveProperty('members');   // code mode sends none
  });
});

describe('auto mode: the client state machine', () => {
  let t, blocked, mem, store, saved, char, tok;
  const mk = (over = {}) => agent.createPartyClient({
    url: () => 'ws://fake/v1/party', WS: FakeWS, getToken: () => tok, getCharacter: () => char, blocked: () => blocked,
    collect: () => null, members: () => mem, version: '4.0.89', now: () => t, pubMs: 2000, rand: () => 0,
    store: { load: () => store, save: (o) => { saved.push(o); } }, ...over,
  });
  beforeEach(() => { vi.useFakeTimers(); t = 1_800_000_000_000; blocked = null; mem = ['Aldenmar']; store = null; saved = []; char = 'Aldenmar'; tok = TOKEN('a'); FakeWS.all = []; });
  afterEach(() => { vi.useRealTimers(); });
  const advance = (ms) => { t += ms; vi.advanceTimersByTime(ms); };
  const last = () => FakeWS.all[FakeWS.all.length - 1];
  const GROUPED = ['Aldenmar', 'Brackwyn', 'Corvale'];
  const join = (c) => { mem = GROUPED; advance(2000); const w = last(); w.open(); w.say({ type: 'welcome', tier: 'free', member: 'Aldenmar' }); return w; };

  it('is off by default: grouped and nothing connects', () => {
    const c = mk(); c.resume();
    mem = GROUPED; advance(10_000);
    expect(FakeWS.all).toHaveLength(0);
    expect(c.status()).toMatchObject({ share: false, status: 'off', mode: null });
  });

  it('with the setting on it connects once grouped: hello {auto:true}, no code, no create; members ride the frame', () => {
    const c = mk(); c.setShare(true);
    advance(2000);
    expect(FakeWS.all).toHaveLength(0);                    // alone: nothing yet
    const w = join(c);
    expect(w.sent[0]).toEqual({ type: 'hello', token: TOKEN('a'), character: 'Aldenmar', agent_version: '4.0.89', auto: true });
    expect(c.status()).toMatchObject({ status: 'joined', mode: 'auto', code: null, share: true });
    advance(2000);
    const pubs = w.sent.filter((m) => m.type === 'pub');
    expect(pubs).toHaveLength(1);
    expect(pubs[0].members).toEqual(GROUPED);
    expect(saved[saved.length - 1]).toEqual({ share: true });   // no code remembered for an auto connection
  });

  it('a dropped socket reconnects in auto mode, not as a code party', () => {
    const c = mk(); c.setShare(true); const w = join(c);
    w.drop(); advance(1000);
    expect(last().sent.length + 1).toBeGreaterThan(0);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', auto: true });
    expect(last().sent[0]).not.toHaveProperty('party');
  });

  it('leaves after MORE than 2 minutes alone, not before, and a regroup resets the clock', () => {
    const c = mk(); c.setShare(true); const w = join(c);
    const alive = (ms) => { for (let n = 0; n < ms; n += 5000) { advance(5000); w.say({ type: 'view', members: 1, players: [], roster: [], fires: [] }); } };   // the relay's 2 s view keeps the socket alive
    mem = ['Aldenmar']; advance(2000);                     // first alone tick starts the clock
    alive(100_000);
    expect(c.status().status).toBe('joined');
    mem = GROUPED; advance(2000);                          // regrouped: the clock is cleared
    mem = ['Aldenmar']; advance(2000); alive(110_000);
    expect(c.status().status).toBe('joined');
    alive(15_000);
    expect(c.status()).toMatchObject({ status: 'off', mode: null });
    expect(w.sent[w.sent.length - 1]).toEqual({ type: 'bye' });
    expect(w.closed).not.toBeNull();
    expect(c.status().share).toBe(true);                   // the setting stays on: it rejoins when grouped again
    mem = GROUPED; advance(2000);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('turning the setting off leaves at once and forgets it', () => {
    const c = mk(); c.setShare(true); const w = join(c);
    c.setShare(false);
    expect(w.sent[w.sent.length - 1]).toEqual({ type: 'bye' });
    expect(c.status()).toMatchObject({ status: 'off', share: false });
    expect(saved[saved.length - 1]).toBeNull();
    advance(10_000);
    expect(FakeWS.all).toHaveLength(1);
  });

  it('not_your_character stops for good with the linking message, and is not retried while grouped', () => {
    const c = mk(); c.setShare(true);
    mem = GROUPED; advance(2000);
    last().open(); last().say({ type: 'error', code: 'not_your_character' }); last().drop();
    advance(300_000);
    expect(FakeWS.all).toHaveLength(1);
    const s = c.status();
    expect(s).toMatchObject({ status: 'ended', auto_stopped: true });
    expect(s.error.code).toBe('not_your_character');
    expect(s.error.message).toBe(agent.PARTY_FATAL.not_your_character);
    expect(s.error.message).toMatch(/isn't linked to your account/);
    expect(s.error.message).toMatch(/raidmimic\.com\/characters/);
    expect(s.error.message).toMatch(/wolfpack\.quest/);
    char = 'Brackwyn'; advance(2000);                      // another character is a fresh try
    expect(FakeWS.all).toHaveLength(2);
    expect(last().sent.length).toBe(0);
  });

  it('toggling the setting clears a refusal and tries again', () => {
    const c = mk(); c.setShare(true); mem = GROUPED; advance(2000);
    last().open(); last().say({ type: 'error', code: 'not_your_character' });
    advance(10_000); expect(FakeWS.all).toHaveLength(1);
    c.setShare(false); c.setShare(true); advance(2000);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('every stand-down holds: no sign-in, dry-run, kill switch, hidden character never connect', () => {
    const c = mk(); c.setShare(true); mem = GROUPED;
    for (const reason of ['signed_out', 'dry_run', 'control', 'hidden', 'no_character']) { blocked = reason; advance(4000); }
    expect(FakeWS.all).toHaveLength(0);
    blocked = null; advance(2000);
    expect(FakeWS.all).toHaveLength(1);
    blocked = 'control'; advance(2000);                    // a block while connected closes the socket and publishes nothing
    expect(c.status()).toMatchObject({ status: 'paused', paused_for: 'control' });
    expect(last().closed).not.toBeNull();
  });

  it('a code party is an explicit opt-in and wins; leaving it returns to auto', () => {
    const c = mk(); c.setShare(true); mem = GROUPED; advance(2000);
    last().open(); last().say({ type: 'welcome', tier: 'free' });
    expect(c.join('K7M2QX').ok).toBe(true);
    expect(c.status()).toMatchObject({ mode: 'code', code: 'K7M2QX' });
    advance(10_000);
    expect(FakeWS.all.filter((w) => w.sent[0] && w.sent[0].auto)).toHaveLength(1);   // the auto socket was replaced, not re-made
    expect(saved[saved.length - 1]).toMatchObject({ code: 'K7M2QX', share: true });
    c.leave();
    expect(c.status().share).toBe(true);                   // leaving a CODE party keeps the setting
    advance(2000);
    expect(c.status().mode).toBe('auto');
  });

  it('leaving an auto connection turns the sharing off (it would reconnect at the next tick otherwise)', () => {
    const c = mk(); c.setShare(true); join(c);
    c.leave();
    expect(c.status()).toMatchObject({ status: 'off', share: false });
    advance(6000); expect(FakeWS.all).toHaveLength(1);
  });

  it('the setting survives a restart: resume() turns auto back on with no code', () => {
    store = { v: 2, share: true };
    const c = mk();
    expect(c.resume()).toBe(true);
    expect(c.status().share).toBe(true);
    mem = GROUPED; advance(2000);
    expect(last().url).toBe('ws://fake/v1/party');
    last().open();
    expect(last().sent[0]).toMatchObject({ auto: true });
  });

  it('setting it on while blocked is kept and connects by itself once the block lifts', () => {
    blocked = 'signed_out';
    const c = mk(); expect(c.setShare(true)).toEqual({ ok: true });
    mem = GROUPED; advance(4000);
    expect(FakeWS.all).toHaveLength(0);
    blocked = null; advance(2000);
    expect(FakeWS.all).toHaveLength(1);
  });
});

describe('auto mode: the agent wiring', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-party-')); agent._partySetFileForTest(path.join(dir, 'party.json')); agent._partyResetForTest(); agent._setMimicSessionForTest(TOKEN('a')); agent._partyCharacterForTest('Aldenmar'); });
  afterEach(() => { agent._partyResetForTest(); agent._partySetFileForTest(null); agent._partyCharacterForTest(null); agent._setMimicSessionForTest(''); agent._setRaidPipeForTest(null); agent._setZealStateForTest('Aldenmar', null); fs.rmSync(dir, { recursive: true, force: true }); });
  const res = () => { const r = { status: 0, body: '' }; r.writeHead = (s) => { r.status = s; }; r.setHeader = () => {}; r.end = (b) => { r.body = b; }; r.json = () => JSON.parse(r.body); return r; };
  const req = (method, url, body) => Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers: {} });

  it('members come from the Zeal group list and the raid pipe: self, raid, group, once each', () => {
    const now = Date.now();
    agent._setZealStateForTest('Aldenmar', { updatedAt: now, group_members: [{ name: 'Brackwyn' }, { name: 'Corvale' }], gauges: [{ slot: 11, text: 'Brackwyn', hp_pct: 70 }, { slot: 12, text: 'Zarrin', hp_pct: 40 }] });
    expect(agent._partyMembers()).toEqual(['Aldenmar', 'Brackwyn', 'Corvale', 'Zarrin']);
    agent._setRaidPipeForTest({ at: now, members: [{ name: 'Aldenmar' }, { name: 'Rethlan' }, { name: 'Corvale' }, { name: 'a bear' }] });
    expect(agent._partyMembers()).toEqual(['Aldenmar', 'Rethlan', 'Corvale', 'Brackwyn', 'Zarrin']);
  });
  it('a stale raid list, a raid list that does not hold this character, and stale group state are ignored', () => {
    const now = Date.now();
    agent._setRaidPipeForTest({ at: now - 60_000, members: [{ name: 'Aldenmar' }, { name: 'Rethlan' }] });
    expect(agent._partyMembers()).toEqual(['Aldenmar']);
    agent._setRaidPipeForTest({ at: now, members: [{ name: 'Nyssara' }, { name: 'Rethlan' }] });   // another box's raid
    expect(agent._partyMembers()).toEqual(['Aldenmar']);
    agent._setZealStateForTest('Aldenmar', { updatedAt: now - 120_000, group_members: [{ name: 'Brackwyn' }] });
    expect(agent._partyMembers()).toEqual(['Aldenmar']);
  });
  it('POST share turns it on and off, is remembered in the party file, and shows on /api/state; default is off', async () => {
    expect(agent._partyShareState()).toEqual({ on: false, waiting: false });
    let r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"share","on":true}'), r);
    expect(r.status).toBe(200); expect(r.json()).toMatchObject({ ok: true, share: true });
    expect(agent._partyShareState()).toEqual({ on: true, waiting: true });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'party.json'), 'utf8'))).toMatchObject({ share: true });
    r = res(); await agent._partyRoute(req('GET', '/api/party'), r); expect(r.json().share).toBe(true);
    r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"share","on":"yes"}'), r); expect(r.status).toBe(400);
    r = res(); await agent._partyRoute(req('POST', '/api/party', '{"action":"share","on":false}'), r);
    expect(r.json().share).toBe(false);
    expect(fs.existsSync(path.join(dir, 'party.json'))).toBe(false);
  });
  it('a restart with the setting on brings the client back', () => {
    fs.writeFileSync(path.join(dir, 'party.json'), JSON.stringify({ v: 2, share: true }));
    agent._partyBoot();
    expect(agent._partyShareState().on).toBe(true);
  });
});

describe('auto mode: end to end over a real socket (the relay in this worktree has no auto mode yet: its side is a stub)', () => {
  it('connects with hello {auto:true} and no code, then publishes `members`', async () => {
    const got = [];
    const { server, port } = await rawServer((sock) => {
      sock.on('data', () => {
        for (const f of clientFrames(sock.rx || Buffer.alloc(0))) if (f.op === 1) { const m = JSON.parse(f.body.toString()); if (!got.some((g) => JSON.stringify(g) === JSON.stringify(m))) got.push(m); if (m.type === 'hello') sock.write(frame(1, JSON.stringify({ type: 'welcome', tier: 'free', member: m.character }))); }
      });
    });
    const grouped = ['Aldenmar', 'Brackwyn', 'Corvale'];
    const c = agent.createPartyClient({ url: () => `ws://127.0.0.1:${port}/v1/party`, getToken: () => TOKEN('a'), getCharacter: () => 'Aldenmar', blocked: () => null, collect: () => null, members: () => grouped, version: '4.0.89', pubMs: 80, rand: () => 0 });
    try {
      c.setShare(true);
      const until = async (fn, ms = 4000) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 15)); } };
      await until(() => got.find((m) => m.type === 'pub'));
      expect(got[0]).toEqual({ type: 'hello', token: TOKEN('a'), character: 'Aldenmar', agent_version: '4.0.89', auto: true });
      expect(got.find((m) => m.type === 'pub').members).toEqual(grouped);
      expect(c.status()).toMatchObject({ status: 'joined', mode: 'auto' });
    } finally { c.destroy(); server.close(); }
  });
});

describe('auto mode: the surfaces carry it', () => {
  const agentSrc = stripJs(readSource(AGENT_INDEX));
  const dash = read('packages/wolfpack-logsync/dashboard.html');
  it('the dashboard card has the checkbox (default off), the privacy line, and an "Or share by code" section', () => {
    expect(dash).toContain('Share with my in-game group and raid');
    expect(dash).toMatch(/id="wpPtShare"/);
    expect(dash).toMatch(/who also use Mimic/);
    expect(dash).toMatch(/Or share by code/);
    expect(dash).toMatch(/action: 'share'/);
    expect(dash).toMatch(/s\.partyShare/);
    expect(agentSrc).toMatch(/partyShare:\s+_partyShareState\(\)/);
  });
  it('the card\'s auto section prints nothing that ticks', () => {
    const card = dash.slice(dash.indexOf('function wpPtAutoHtml'), dash.indexOf('function wpPtRepaint'));
    expect(card).not.toMatch(/view_age_ms|retry_in_ms|fmtAgo|toLocaleTimeString|Date\.now/);
  });
  it('the tray and Settings drive the same setting through the agent (parity)', () => {
    const main = stripJs(read('apps/mimic/main.js'));
    expect(main).toMatch(/type: 'checkbox', checked: !!\(p && p\.share\)/);
    expect(main).toMatch(/action: 'share', on: !!on/);
    expect(main).toMatch(/ipcMain\.handle\('party-share-get'/);
    expect(main).toMatch(/ipcMain\.handle\('party-share-set'/);
    const pre = stripJs(read('apps/mimic/preload.js'));
    expect(pre).toMatch(/getPartyShare:\s+\(\)\s+=> ipcRenderer\.invoke\('party-share-get'\)/);
    expect(pre).toMatch(/setPartyShare:\s+\(on\)\s+=> ipcRenderer\.invoke\('party-share-set'/);
    const set = read('apps/mimic/settings.html');
    expect(set).toMatch(/id="partyShareBox"/);
    expect(set).toMatch(/window\.mimic\.setPartyShare\(box\.checked\)/);
  });
});
