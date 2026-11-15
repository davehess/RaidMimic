'use strict';
// apps/raidmimic-relay/lib.js — the pure parts of the Raid Mimic party relay: validation, the tier rule, the
// per-player merge, parties and their history ring, the session resolver and its cache. Built-ins only (no `ws`),
// so test/raidmimic-relay.test.js imports it without this folder's node_modules. index.js is the socket glue.
//
// Nothing here touches a clock, a socket or the network unless it is handed one: every function takes `now` (epoch
// ms) and the resolver takes a fetch, so the tests drive time and the RPC by hand.

const crypto = require('node:crypto');

// ── Constants ─────────────────────────────────────────────────────────────────────────────────────────────────
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';        // 31 characters, no 0 O 1 I L (the Mimic link code's)
const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;
const TOKEN_RE = /^wpms_[0-9a-f]{64}$/;                            // utils/mimicLink.js SESSION_TOKEN_RE
const NAME_RE = /^[A-Za-z']{1,24}$/;
const VERSION_RE = /^[0-9A-Za-z.+-]{1,24}$/;

const MAX_FRAME_BYTES = 32 * 1024;
const MAX_ROWS = 80;
const MAX_FIRES_PER_FRAME = 20;
const MAX_TEXT = 120;
const MAX_NUMBER = 1e12;

// Live merging is free for everyone and funded by donations (the guild lead, 2026-11-15, DECISIONS §588: "same day
// overlay data merging is done on the new bot, donation based up front. the hosted replays are the main point to
// charge for"). So a free party gets every stream and the full size. Set LIVE_MERGE_FREE to false to bring back the
// first draft's limits (6 members, roster and trigger fires only) without touching the rest.
const LIVE_MERGE_FREE = true;
const limited = (tier) => tier === 'free' && !LIVE_MERGE_FREE;
const PAID_MEMBER_CAP = 72;
const FREE_MEMBER_CAP = LIVE_MERGE_FREE ? PAID_MEMBER_CAP : 6;
const MAX_CLIENTS = 2000;

const PARTY_GRACE_MS = 15 * 60 * 1000;      // a party dies this long after its last member leaves
const SAMPLE_TTL_MS = 30 * 1000;            // a member's frame stops counting toward the merge after this
const STALE_MS = 10 * 1000;                 // the view is flagged stale when the freshest sample is older than this
const HISTORY_STEP_MS = 10 * 1000;
const HISTORY_SPAN_MS = 10 * 60 * 1000;
const FIRES_IN_VIEW = 20;
const FIRES_KEPT = 60;
const MIN_PUB_GAP_MS = 500;                 // a client publishes about every 2 s; faster than this is dropped

const RESOLVE_HIT_MS = 5 * 60 * 1000;
const RESOLVE_MISS_MS = 60 * 1000;
const RESOLVE_CACHE_MAX = 5000;
const FAILED_HELLOS_PER_MIN = 10;

const STATS = ['dmg', 'heal', 'took', 'threat'];

// ── Codes ─────────────────────────────────────────────────────────────────────────────────────────────────────
// randomInt is uniform (no modulo bias, which a 31-letter alphabet over a byte would have).
function makeCode(randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}
function normalizeCode(c) {
  const s = String(c == null ? '' : c).trim().toUpperCase();
  return CODE_RE.test(s) ? s : null;
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────────────────────
const isPlainObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const validName = (n) => typeof n === 'string' && NAME_RE.test(n);
const validNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER;
const validTime = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e14;   // epoch ms is ~1.8e12, over MAX_NUMBER
const validText =(t) => typeof t === 'string' && t.length >= 1 && t.length <= MAX_TEXT && !/[\u0000-\u001f\u007f]/.test(t);

// Raw socket data → a parsed object, or null (too big, not JSON, not an object). Never throws, never echoes input.
function parseFrame(raw) {
  const len = typeof raw === 'string' ? Buffer.byteLength(raw) : raw && raw.length;
  if (!len || len > MAX_FRAME_BYTES) return null;
  try {
    const o = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    return isPlainObject(o) ? o : null;
  } catch { return null; }
}

// The hello. { ok:true, hello:{token, party, create, character, agentVersion} } or { ok:false, code }.
// Exactly one of `party` and `create:true`.
function validateHello(o) {
  if (!isPlainObject(o) || o.type !== 'hello') return { ok: false, code: 'bad_hello' };
  if (typeof o.token !== 'string' || !TOKEN_RE.test(o.token)) return { ok: false, code: 'bad_token' };
  if (!validName(o.character)) return { ok: false, code: 'bad_character' };
  const create = o.create === true;
  const party = o.party == null ? null : normalizeCode(o.party);
  if (create === (o.party != null)) return { ok: false, code: 'bad_party' };
  if (!create && !party) return { ok: false, code: 'bad_party' };
  const agentVersion = typeof o.agent_version === 'string' && VERSION_RE.test(o.agent_version) ? o.agent_version : '';
  return { ok: true, hello: { token: o.token, party, create, character: o.character, agentVersion } };
}

// A `pub` frame. Strict: ANY violation drops the whole frame ({ok:false, reason}); the reason is a fixed word, never
// the offending input. The result is a fresh object built field by field, so nothing a client sent rides along.
function validatePub(o, now = Date.now()) {
  if (!isPlainObject(o) || o.type !== 'pub') return { ok: false, reason: 'shape' };
  const out = { perPlayer: new Map(), target: null, casting: null, roster: null, fires: [] };

  if (o.perPlayer != null) {
    if (!isPlainObject(o.perPlayer)) return { ok: false, reason: 'perPlayer' };
    const names = Object.keys(o.perPlayer);
    if (names.length > MAX_ROWS) return { ok: false, reason: 'rows' };
    for (const name of names) {
      const row = o.perPlayer[name];
      if (!validName(name) || !isPlainObject(row)) return { ok: false, reason: 'perPlayer' };
      const clean = {};
      for (const k of STATS) {
        if (row[k] == null) { clean[k] = 0; continue; }
        if (!validNumber(row[k])) return { ok: false, reason: 'number' };
        clean[k] = row[k];
      }
      out.perPlayer.set(name, clean);
    }
  }
  for (const k of ['target', 'casting']) {
    if (o[k] == null) continue;
    if (!validText(o[k])) return { ok: false, reason: k };
    out[k] = o[k];
  }
  if (o.roster != null) {
    if (!Array.isArray(o.roster) || o.roster.length > MAX_ROWS) return { ok: false, reason: 'roster' };
    out.roster = [];
    for (const r of o.roster) {
      if (!isPlainObject(r) || !validName(r.name) || !validNumber(r.hp) || r.hp > 100) return { ok: false, reason: 'roster' };
      out.roster.push({ name: r.name, hp: r.hp });
    }
  }
  if (o.fires != null) {
    if (!Array.isArray(o.fires) || o.fires.length > MAX_FIRES_PER_FRAME) return { ok: false, reason: 'fires' };
    for (const f of o.fires) {
      if (!isPlainObject(f) || !validText(f.text) || !validTime(f.at)) return { ok: false, reason: 'fires' };
      // An agent's clock may be off; a fire is never older than the history window or from the future.
      out.fires.push({ text: f.text, at: Math.min(now, Math.max(now - HISTORY_SPAN_MS, Math.round(f.at))) });
    }
  }
  return { ok: true, pub: out };
}

// ── The tier rule ─────────────────────────────────────────────────────────────────────────────────────────────
// The SQL (relay_resolve_session) decides a PLAYER's tier from the database; this is the same rule in JS so the
// tests pin it, and so the relay can re-check a trial that ends while the socket is open.
//   pro   — a member of a guild on plan 'managed', or a player with plan 'pro', or a Wolf Pack member session
//   trial — now < trial_ends_at
//   free  — everything else
function playerTier({ wolfpackMember = false, guildPlans = [], plan = 'free', trialEndsAt = null }, now) {
  if (wolfpackMember || plan === 'pro' || guildPlans.includes('managed')) return 'pro';
  if (trialEndsAt && now < Date.parse(trialEndsAt)) return 'trial';
  return 'free';
}
// A member's tier right now: a trial that has run out while connected counts as free.
function memberTier(m, now) {
  if (m.tier === 'pro') return 'pro';
  if (m.tier === 'trial' && m.trialEndsAt && now < Date.parse(m.trialEndsAt)) return 'trial';
  return 'free';
}
// A party is as good as its best member: one Pro member lifts the whole party.
function partyTier(tiers) {
  if (tiers.includes('pro')) return 'pro';
  if (tiers.includes('trial')) return 'trial';
  return 'free';
}
const capForTier = (tier) => (tier === 'free' ? FREE_MEMBER_CAP : PAID_MEMBER_CAP);

// ── A party ───────────────────────────────────────────────────────────────────────────────────────────────────
class Party {
  constructor(code, now) {
    this.code = code;
    this.createdAt = now;
    this.members = new Map();     // memberKey → { key, character, tier, trialEndsAt, pub, pubAt, lastPubAt }
    this.emptySince = now;        // a new party is "empty" until its creator joins, so an abandoned code still dies
    this.fires = [];              // newest last, deduped, capped
    this.history = [];            // [{ t, players }] at most HISTORY_SPAN_MS / HISTORY_STEP_MS entries
    this.lastHistoryAt = 0;
  }

  tier(now) { return partyTier([...this.members.values()].map((m) => memberTier(m, now))); }

  // What the party's tier would be with `joiner` added: a Pro joiner lifts a full free party above its cap.
  canJoin(joiner, now) {
    const tiers = [...this.members.values()].map((m) => memberTier(m, now));
    tiers.push(memberTier(joiner, now));
    return this.members.size < capForTier(partyTier(tiers));
  }

  add(member) { this.members.set(member.key, { ...member, pub: null, pubAt: 0, lastPubAt: 0 }); this.emptySince = null; }
  remove(key, now) { this.members.delete(key); if (!this.members.size) this.emptySince = now; }
  expired(now) { return !this.members.size && this.emptySince != null && now - this.emptySince >= PARTY_GRACE_MS; }

  // Latest-wins per submitter: a new frame replaces the member's last one wholesale. Streams a party's tier does
  // not include are not kept at all. Returns false when the frame was dropped for arriving too fast.
  ingest(key, pub, now) {
    const m = this.members.get(key);
    if (!m) return false;
    if (m.lastPubAt && now - m.lastPubAt < MIN_PUB_GAP_MS) return false;
    m.lastPubAt = now;
    const full = !limited(this.tier(now));
    m.pub = full ? pub : { perPlayer: new Map(), target: null, casting: null, roster: pub.roster, fires: pub.fires };
    m.pubAt = now;
    for (const f of pub.fires) {
      if (!this.fires.some((g) => g.at === f.at && g.text === f.text)) this.fires.push(f);
    }
    if (this.fires.length > 1) this.fires.sort((a, b) => a.at - b.at);
    if (this.fires.length > FIRES_KEPT) this.fires.splice(0, this.fires.length - FIRES_KEPT);
    return true;
  }

  // The merge. Per player, per stat: the MAX across submitters, never the sum (every raider's agent sees the same
  // fight, so adding them would multiply the damage by the number of agents; docs/DESIGN-live-guild-dps.md).
  // Each stat carries the age of the frame that held the winning value. Frames older than SAMPLE_TTL_MS are ignored.
  merged(now) {
    const players = new Map();
    const roster = new Map();
    let freshest = 0, target = null, casting = null, targetAt = 0, castingAt = 0;
    for (const m of this.members.values()) {
      if (!m.pub || now - m.pubAt > SAMPLE_TTL_MS) continue;
      freshest = Math.max(freshest, m.pubAt);
      for (const [name, row] of m.pub.perPlayer) {
        let p = players.get(name);
        if (!p) { p = { name, dmg: 0, heal: 0, took: 0, threat: 0, age: {} }; players.set(name, p); }
        for (const k of STATS) {
          const age = now - m.pubAt;
          if (p.age[k] === undefined || row[k] > p[k]) { p[k] = row[k]; p.age[k] = age; }
          else if (row[k] === p[k]) p.age[k] = Math.min(p.age[k], age);   // the same value seen fresher
        }
      }
      if (m.pub.roster) {
        for (const r of m.pub.roster) {
          const prev = roster.get(r.name);
          if (!prev || m.pubAt > prev.at) roster.set(r.name, { name: r.name, hp: r.hp, at: m.pubAt });
        }
      }
      if (m.pub.target && m.pubAt >= targetAt) { target = m.pub.target; targetAt = m.pubAt; }
      if (m.pub.casting && m.pubAt >= castingAt) { casting = m.pub.casting; castingAt = m.pubAt; }
    }
    const list = [...players.values()].sort((a, b) => b.dmg - a.dmg || a.name.localeCompare(b.name));
    return {
      players: list.slice(0, MAX_ROWS * 2),
      roster: [...roster.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS).map((r) => ({ name: r.name, hp: r.hp })),
      target, casting,
      stale: !freshest || now - freshest > STALE_MS,
    };
  }

  // The same view goes to every member of the party, so the caller stringifies it once.
  view(now) {
    const tier = this.tier(now);
    const m = this.merged(now);
    let trialEndsAt = null;
    if (tier === 'trial') {
      for (const x of this.members.values()) if (memberTier(x, now) === 'trial' && (!trialEndsAt || x.trialEndsAt > trialEndsAt)) trialEndsAt = x.trialEndsAt;
    }
    return {
      type: 'view', party: this.code, tier, trial_ends_at: trialEndsAt, members: this.members.size,
      players: limited(tier) ? [] : m.players.map((p) => ({ name: p.name, dmg: p.dmg, heal: p.heal, took: p.took, threat: p.threat, age_ms: p.age })),
      roster: m.roster,
      fires: this.fires.slice(-FIRES_IN_VIEW),
      ...(limited(tier) ? {} : { target: m.target, casting: m.casting }),
      stale: m.stale,
    };
  }

  // Once per HISTORY_STEP_MS, keep the merged players (paid parties only: free has no per-player numbers).
  sampleHistory(now) {
    if (now - this.lastHistoryAt < HISTORY_STEP_MS || limited(this.tier(now))) return false;
    const m = this.merged(now);
    if (m.stale || !m.players.length) return false;
    this.lastHistoryAt = now;
    this.history.push({ t: now, players: m.players.map((p) => ({ name: p.name, dmg: p.dmg, heal: p.heal, took: p.took, threat: p.threat })) });
    const cutoff = now - HISTORY_SPAN_MS;
    while (this.history.length && this.history[0].t < cutoff) this.history.shift();
    return true;
  }
}

// ── Failed-hello rate limit (per IP) ──────────────────────────────────────────────────────────────────────────
class FailLimiter {
  constructor(perMin = FAILED_HELLOS_PER_MIN, max = 5000) { this.perMin = perMin; this.max = max; this.hits = new Map(); }
  blocked(ip, now) { return this._recent(ip, now).length >= this.perMin; }
  fail(ip, now) {
    const list = this._recent(ip, now);
    list.push(now);
    this.hits.set(ip, list);
    if (this.hits.size > this.max) this.hits.delete(this.hits.keys().next().value);
  }
  _recent(ip, now) { const list = (this.hits.get(ip) || []).filter((t) => now - t < 60000); if (!list.length) this.hits.delete(ip); return list; }
}

// ── The session resolver ──────────────────────────────────────────────────────────────────────────────────────
class ResolveError extends Error {}

// The RPC client. It holds the ANON key only; the RPCs are SECURITY DEFINER and return nothing but the identity.
// null means "no such session"; a thrown ResolveError means "could not ask" (never cached, never counted against the IP).
function supabaseRpc({ url, anonKey, fetchImpl = fetch, timeoutMs = 5000 }) {
  const base = String(url || '').replace(/\/+$/, '');
  async function call(fn, token) {
    let res;
    try {
      res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey, authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ p_token: token }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new ResolveError('unreachable'); }
    if (!res.ok) throw new ResolveError(`status ${res.status}`);
    try { return await res.json(); } catch { throw new ResolveError('unreadable'); }
  }
  return {
    resolve: (token) => call('relay_resolve_session', token),
    startTrial: (token) => call('relay_start_trial', token),
  };
}

// Caches the RPC: a hit 5 min, a miss 60 s, in-flight lookups for one token share one call, bounded map.
function cachedResolver(rpc, { now = Date.now, hitMs = RESOLVE_HIT_MS, missMs = RESOLVE_MISS_MS, max = RESOLVE_CACHE_MAX } = {}) {
  const cache = new Map();    // token → { at, ttl, value }
  const inflight = new Map();
  const put = (token, value) => {
    cache.delete(token);
    cache.set(token, { at: now(), ttl: value ? hitMs : missMs, value });
    if (cache.size > max) cache.delete(cache.keys().next().value);
  };
  return {
    async resolve(token) {
      const c = cache.get(token);
      if (c && now() - c.at < c.ttl) return c.value;
      if (inflight.has(token)) return inflight.get(token);
      const p = Promise.resolve(rpc.resolve(token)).then((v) => {
        const value = isPlainObject(v) ? v : null;
        put(token, value);
        return value;
      }).finally(() => inflight.delete(token));
      inflight.set(token, p);
      return p;
    },
    // Starts the player's trial, then forgets the cached identity so the next resolve sees it.
    async startTrial(token) {
      const ends = await rpc.startTrial(token);
      cache.delete(token);
      return typeof ends === 'string' ? ends : null;
    },
    size: () => cache.size,
  };
}

// An identity key for a socket: the player when the session has one, else a hash of the token (a guest has no player).
function identityKey(identity, token) {
  if (identity && identity.player_id) return `p:${identity.player_id}`;
  return `g:${crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16)}`;
}

// The identity the RPC returned, as the member record a party stores. Only the tier, display name and trial end stay.
function memberFrom(identity, token, character, now) {
  return {
    key: `${identityKey(identity, token)}:${character.toLowerCase()}`,
    character,
    tier: ['pro', 'trial'].includes(identity.tier) ? identity.tier : 'free',   // decided by the RPC (see playerTier)
    trialEndsAt: identity.trial_ends_at || null,
  };
}

module.exports = {
  CODE_ALPHABET, CODE_RE, TOKEN_RE, NAME_RE,
  MAX_FRAME_BYTES, MAX_ROWS, MAX_TEXT, FREE_MEMBER_CAP, PAID_MEMBER_CAP, MAX_CLIENTS,
  PARTY_GRACE_MS, SAMPLE_TTL_MS, STALE_MS, HISTORY_STEP_MS, HISTORY_SPAN_MS, MIN_PUB_GAP_MS,
  RESOLVE_HIT_MS, RESOLVE_MISS_MS, FAILED_HELLOS_PER_MIN,
  makeCode, normalizeCode, parseFrame, validateHello, validatePub,
  playerTier, memberTier, partyTier, capForTier, Party, FailLimiter,
  ResolveError, supabaseRpc, cachedResolver, identityKey, memberFrom,
};
