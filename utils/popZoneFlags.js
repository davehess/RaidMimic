// utils/popZoneFlags.js — GET /api/agent/pop-zone-flags?zone=<gate key>&names=a,b,c
// The Command Center's "who is in the raid but not flagged for this zone" (the guild lead, 2026-11-19). The agent knows
// the raid roster and the zone but only its own player's flags, so it asks here, with the names, for ONE gate.
//
// Every rule is the website's /pop/raid tiers (web/lib/popRaidTiers.ts zoneView): the engine's gateReport over what
// each name holds (pop_flags rows, the owner's ticks, /who proof, merged by utils/popStatus.js load) and whether they
// have had a FULL read lately (the Seer's recital or a #popflags read), because only then is an absent flag a real no.
//   'missing'  a piece of the gate is known to be owed (or the Seer holds it pending)
//   'unknown'  nothing is owed that we can prove, but some piece has no record either way, or the character opted out
//   'flagged'  every piece of the gate is done
// An absent name, a failed read and an opted-out character are all 'unknown': an absent record proves nothing.
'use strict';

const engine = require('./popEngine');

const MAX_NAMES = 80;
const CACHE_MS = 60_000;
const FULL_READ_DAYS = 14;
const FULL_READ_SOURCES = ['recital', 'popflags', 'popflags_paste'];

const lc = (s) => String(s || '').toLowerCase();
const enc = encodeURIComponent;
const ZONE_BY_KEY = new Map(engine.POP_ZONES.map(z => [z.key, z]));

/** One character against one gate: 'flagged' | 'missing' | 'unknown'. Pure. */
function classify(zone, flags, fullRead) {
  const rep = engine.gateReport(zone, { flags: flags || [], fullRead: !!fullRead });
  if (rep.pieces.some(p => p.state === 'missing' || p.state === 'pending')) return 'missing';
  return rep.pieces.some(p => p.state === 'unknown') ? 'unknown' : 'flagged';
}

/** `status` is the popStatus service (its `load(names)`); `supabase` is utils/supabase.js or a fake. */
function create({ supabase, guildId, status, now = Date.now, cacheMs = CACHE_MS }) {
  const gid = () => (typeof guildId === 'function' ? guildId() : guildId);
  const cache = new Map();   // 'gate|name' -> { at, v }

  async function optedOut(names) {
    const rows = await supabase.select('characters',
      `guild_id=eq.${enc(gid())}&name=in.(${names.map(enc).join(',')})&exclude_from_stats=is.true&select=name&limit=200`).catch(() => null);
    return Array.isArray(rows) ? new Set(rows.map(r => lc(r.name))) : null;
  }
  async function fullReads(names) {
    const since = new Date(now() - FULL_READ_DAYS * 86_400_000).toISOString();
    const rows = await supabase.selectAllPaged('pop_flags',
      `guild_id=eq.${enc(gid())}&character=in.(${names.map(enc).join(',')})&source=in.(${FULL_READ_SOURCES.join(',')})&created_at=gte.${enc(since)}&select=character`, 'id').catch(() => null);
    return Array.isArray(rows) ? new Set(rows.map(r => lc(r.character))) : null;
  }

  /** -> { zone, members: { <lower name>: state } } or null when the key is not a gated zone. Never throws. */
  async function answer({ zone, names }) {
    const z = ZONE_BY_KEY.get(String(zone || ''));
    if (!z || !z.requires.length) return null;
    // Names keep the case Zeal gave them: the tables are matched by exact name. Answers are keyed lower-case.
    const seen = new Set();
    const list = (Array.isArray(names) ? names : []).map(n => String(n || '').trim())
      .filter(n => /^[A-Za-z]{2,24}$/.test(n) && !seen.has(lc(n)) && seen.add(lc(n))).slice(0, MAX_NAMES);
    const members = {};
    for (const n of list) members[lc(n)] = 'unknown';
    if (!list.length || !supabase || !supabase.isEnabled()) return { zone: z.key, members };

    const t = now();
    const stale = [];
    for (const n of list) {
      const c = cache.get(z.key + '|' + lc(n));
      if (c && t - c.at < cacheMs) members[lc(n)] = c.v; else stale.push(n);
    }
    if (stale.length) {
      const [held, reads, out] = await Promise.all([
        Promise.resolve(status.load(stale)).catch(() => null), fullReads(stale), optedOut(stale)]);
      if (held && reads && out) {   // a failed read leaves them 'unknown' and is not cached
        for (const n of stale) {
          const k = lc(n);
          const v = out.has(k) ? 'unknown' : classify(z, held.get(k) || [], reads.has(k));
          members[k] = v;
          cache.set(z.key + '|' + k, { at: t, v });
        }
      }
    }
    return { zone: z.key, members };
  }

  return { answer, _cache: cache };
}

module.exports = { create, classify, MAX_NAMES };
