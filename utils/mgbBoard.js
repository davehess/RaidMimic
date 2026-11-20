// utils/mgbBoard.js — the Mass Group Buff board for Mimic's Command Center (the guild lead's pick B).
//
// Mass Group Buff (AA index 35, eqemu_altadv_vars skill 128) arms the NEXT group buff to hit everyone in range.
// The press starts a 4320 s reuse (docs/data/class-abilities.json, reuse_source quarm dump). The log prints
// "The next group buff you cast will hit all targets in range." only on the presser's own client, so the raid
// sees an MGB only as one group spell landing on a whole raid at once. This module finds those, says who cast
// each (best evidence first) and keeps a per-holder cooldown.
//
// DETECTION (pure, detectMgbs): one beneficial group spell (targettype 3 or 41, good_effect 1) landing on at
// least MIN_TARGETS distinct targets that span at least MIN_GROUPS raid groups inside WINDOW_S seconds.
// An ordinary group buff touches 6 people in one group, so 12 targets across 2 groups cannot be one.
//
// PLACEMENT (the cheaper of the two asked for): a hook on the buff_casts ingest, NOT a timer. noteLandings()
// pushes the accepted rows into a per-spell in-memory ring (120 s) and only runs the detector when that ring
// already holds MIN_TARGETS distinct targets inside the window. No database read per row, nothing at all for a
// non-group spell, nothing on a quiet night. A 15 s timer would read two minutes of buff_casts (thousands of
// rows on a raid night) 240 times an hour to find an event that happens once every 72 minutes. board() runs the
// same scan, so an upload that raced the hook is still found by the next poll while it is inside the ring.
//
// ATTRIBUTION, in order: own_log (the presser's agent POSTed the activation line) → cast_stream (a raid_casts row
// of the same spell finishing within ±CAST_MATCH_S of the landing) → candidates (trained holders whose class has
// the spell, minus anyone whose known cooldown was still running).
//
// STATE IS IN MEMORY. A restart forgets cooldowns, and a holder with no known MGB reads as ready (unknown):
// ready_at null. The ONE-REPLICA rule (utils/liveMemory.js) already applies to the bot.

const MGB_REUSE_S = 4320;
const ACTIVATION_TEXT = 'The next group buff you cast will hit all targets in range.';
const SESSION_MS = 6 * 3600 * 1000;
const RING_MS = 120 * 1000;
const RING_MAX = 3000;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const limits = () => ({
  minTargets: num(process.env.MGB_MIN_TARGETS, 12),
  minGroups: 2,
  windowS: num(process.env.MGB_WINDOW_S, 3),
});
const classKey = (c) => String(c || '').toLowerCase().replace(/[^a-z]/g, '');
const lc = (s) => String(s || '').trim().toLowerCase();
const iso = (ms) => new Date(ms).toISOString();

// landings: [{ spell_id, spell, target, t (ms) }]. → [{ at (ms), spell_id, spell, targets: [name], groups: [n] }]
function detectMgbs(landings, opts) {
  const o = { ...limits(), ...opts };
  const winMs = o.windowS * 1000;
  const bySpell = new Map();
  for (const l of landings || []) {
    if (!l || !(l.t > 0) || !l.target || !o.isGroupSpell(l.spell_id)) continue;
    if (!bySpell.has(l.spell_id)) bySpell.set(l.spell_id, []);
    bySpell.get(l.spell_id).push(l);
  }
  const out = [];
  for (const [spellId, arr] of bySpell) {
    arr.sort((a, b) => a.t - b.t);
    let i = 0;
    while (i < arr.length) {
      let j = i;
      const targets = new Map();   // lower → display name
      const groups = new Set();
      while (j < arr.length && arr[j].t - arr[i].t <= winMs) {
        const k = lc(arr[j].target);
        if (!targets.has(k)) {
          targets.set(k, arr[j].target);
          const g = o.groupOf(arr[j].target);
          if (g != null) groups.add(g);
        }
        j++;
      }
      if (targets.size >= o.minTargets && groups.size >= o.minGroups) {
        out.push({ at: arr[i].t, spell_id: spellId, spell: arr[i].spell || null, targets: [...targets.values()], groups: [...groups] });
        i = j;   // the whole window is one MGB
      } else i++;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// ctx: { holders: [{ name, class }], ownLog: Map(lower → { at, spell }), casts: [{ caster, spell, cast_at (ms), cast_secs }],
//        classKeys: Set | null (classes that have the spell; null = unknown), readyAt: (lower) → ms | null }
// → { caster, basis, candidates, pressAt }   pressAt = when the caster's reuse timer started, or null
function attribute(mgb, ctx) {
  const holders = ctx.holders || [];
  const canCast = (h) => !ctx.classKeys || ctx.classKeys.has(classKey(h.class));
  const spellL = lc(mgb.spell);

  // (a) own_log: the holder's own agent saw the activation line shortly before the landing.
  let best = null;
  for (const h of holders) {
    const a = ctx.ownLog && ctx.ownLog.get(lc(h.name));
    if (!a || !canCast(h)) continue;
    const age = (mgb.at - a.at) / 1000;
    if (age < -2 || age > 60) continue;
    if (a.spell && lc(a.spell) !== spellL) continue;
    if (!best || a.at > best.at) best = { name: h.name, at: a.at };
  }
  if (best) return { caster: best.name, basis: 'own_log', candidates: [best.name], pressAt: best.at };

  // (b) cast_stream: a cast of this spell that finished when it landed.
  const hits = (ctx.casts || []).filter(c => lc(c.spell) === spellL
    && Math.abs(c.cast_at + (Number(c.cast_secs) || 0) * 1000 - mgb.at) <= 2000);
  if (hits.length) {
    const names = [...new Set(hits.map(c => c.caster))];
    const held = names.filter(n => holders.some(h => lc(h.name) === lc(n)));
    const pick = held.length === 1 ? held : names.length === 1 ? names : null;
    if (pick) {
      const row = hits.find(c => c.caster === pick[0]);
      return { caster: pick[0], basis: 'cast_stream', candidates: [pick[0]], pressAt: null, castSecs: Number(row.cast_secs) || 0 };
    }
    return { caster: null, basis: 'candidates', candidates: held.length ? held : names, pressAt: null };
  }

  // (c) candidates: trained holders whose class has the spell and whose known cooldown was not still running.
  const able = holders.filter(canCast);
  const free = able.filter(h => { const r = ctx.readyAt && ctx.readyAt(lc(h.name)); return !(r && r > mgb.at); });
  const list = (free.length ? free : able).map(h => h.name);
  return { caster: null, basis: 'candidates', candidates: list, pressAt: null };
}

// Cooldown: own_log counts from the activation, cast_stream from the landing minus the cast time.
function mgbReadyAt(basis, { activationMs, landingMs, castSecs }) {
  if (basis === 'own_log') return activationMs + MGB_REUSE_S * 1000;
  return landingMs - (Number(castSecs) || 0) * 1000 + MGB_REUSE_S * 1000;
}

// deps: { now(), spellInfo(id) → { name, castSecs } | null (group+good spells only; sync, from the loaded catalog),
//         loadSpells() → refreshes that catalog, rosterRows() → raid_roster rows | null, trainedSet() → Set(lower) ,
//         spellClasses(id) → Promise<Set(classKey) | null>, castsNear(spell, fromMs, toMs) → Promise<rows | null> }
function create(deps) {
  const now = deps.now || Date.now;
  const ring = new Map();      // spell_id → [{ spell_id, spell, target, t }]
  let events = [];             // detected MGBs (internal; targets kept for raid scoping)
  let seq = 0;
  const ownLog = new Map();    // lower → { name, at, spell }  — the last activation per character
  const holderState = new Map(); // lower → { ready_at, last_spell, basis, pressAt }

  function rosterIndex(rows) {
    const byName = new Map();
    for (const r of rows || []) {
      if (!r || !r.name) continue;
      const k = lc(r.name);
      const prev = byName.get(k);
      if (!prev) { byName.set(k, { ...r }); continue; }
      const newer = String(r.captured_at || '') > String(prev.captured_at || '');
      const keepGroup = prev.group_num == null && r.group_num != null ? r.group_num : null;
      if (newer) byName.set(k, { ...r, group_num: r.group_num != null ? r.group_num : prev.group_num });
      else if (keepGroup != null) prev.group_num = keepGroup;
    }
    return byName;
  }

  async function scan() {
    const rows = await Promise.resolve(deps.rosterRows()).catch(() => null);
    if (!Array.isArray(rows)) return;
    const idx = rosterIndex(rows);
    const all = [];
    for (const arr of ring.values()) all.push(...arr);
    const found = detectMgbs(all, {
      isGroupSpell: (id) => !!deps.spellInfo(id),
      groupOf: (n) => { const r = idx.get(lc(n)); return r && r.group_num != null ? Number(r.group_num) : null; },
    });
    const winMs = limits().windowS * 1000;
    for (const f of found) {
      const ex = events.find(e => e.spell_id === f.spell_id && Math.abs(e.at - f.at) <= winMs);
      if (ex) {   // later observers filled in more of the same cast
        ex.at = Math.min(ex.at, f.at);
        const names = new Map(ex.targets.map(n => [lc(n), n]));
        for (const n of f.targets) names.set(lc(n), n);
        ex.targets = [...names.values()];
        ex.groups = [...new Set([...ex.groups, ...f.groups])];
      } else events.push({ ...f, id: ++seq, attr: null, castCheckedAt: 0 });
    }
    const cutoff = now() - SESSION_MS;
    events = events.filter(e => e.at >= cutoff);
  }

  // Called from the buff_casts ingest with the rows that were accepted. Never throws, never reads the database.
  function noteLandings(rows) {
    try {
      const touched = new Set();
      const t0 = now();
      for (const r of rows || []) {
        const id = Number(r && r.spell_id);
        if (!(id > 0) || !r.target || !r.cast_at || !deps.spellInfo(id)) continue;
        const t = Date.parse(r.cast_at);
        if (!(t > 0) || t < t0 - RING_MS) continue;
        let arr = ring.get(id);
        if (!arr) ring.set(id, arr = []);
        arr.push({ spell_id: id, spell: r.spell_name || null, target: r.target, t });
        touched.add(id);
      }
      let due = false;
      const win = limits().windowS * 1000 + 5000;
      for (const id of touched) {
        let arr = ring.get(id).filter(l => l.t >= t0 - RING_MS);
        if (arr.length > RING_MAX) arr = arr.slice(-RING_MAX);
        ring.set(id, arr);
        const newest = arr.reduce((m, l) => Math.max(m, l.t), 0);
        const distinct = new Set(arr.filter(l => l.t >= newest - win).map(l => lc(l.target)));
        if (distinct.size >= limits().minTargets) due = true;
      }
      for (const [id, arr] of ring) if (!arr.length || arr[arr.length - 1].t < t0 - RING_MS) { if (!touched.has(id)) ring.delete(id); }
      if (due) scan().catch(() => {});
    } catch { /* an ingest never fails over the board */ }
  }

  // The activation line on the presser's own client. Keeps the last per character and starts their cooldown.
  function noteActivation({ character, at, spell }) {
    const name = String(character || '').trim().slice(0, 64);
    if (!name) return { status: 400, body: { error: 'character required' } };
    let t = Date.parse(at);
    const n = now();
    if (!(t > 0) || t > n + 30_000 || t < n - SESSION_MS) t = n;
    const sp = spell ? String(spell).trim().slice(0, 128) : null;
    const prev = ownLog.get(lc(name));
    if (!prev || t >= prev.at) ownLog.set(lc(name), { name, at: t, spell: sp });
    const st = holderState.get(lc(name));
    if (!st || t >= st.pressAt) {
      holderState.set(lc(name), { ready_at: mgbReadyAt('own_log', { activationMs: t }), last_spell: sp || (st && st.last_spell) || null, basis: 'own_log', pressAt: t });
    }
    return { status: 200, body: { ok: true } };
  }

  async function settle(ev, holders) {
    const spell = deps.spellInfo(ev.spell_id) || {};
    const name = ev.spell || spell.name || null;
    // An own_log POST can land after the detection, so every rung is re-tried until the top one holds.
    if (!ev.attr || ev.attr.basis !== 'own_log') {
      const classKeys = await Promise.resolve(deps.spellClasses(ev.spell_id)).catch(() => null);
      if (!(ev.casts && ev.casts.length) && now() - ev.at <= 120_000 && now() - ev.castCheckedAt >= 15_000) {
        ev.castCheckedAt = now();
        const rows = await Promise.resolve(deps.castsNear(name, ev.at - 20_000, ev.at + 5_000)).catch(() => null);
        if (Array.isArray(rows)) ev.casts = rows.map(c => ({ caster: c.caster, spell: c.spell, cast_at: Date.parse(c.cast_at), cast_secs: c.cast_secs }));
      }
      const a = attribute({ at: ev.at, spell: name }, {
        holders, ownLog, classKeys, casts: ev.casts || [], readyAt: (k) => (holderState.get(k) || {}).ready_at || null,
      });
      ev.attr = { ...a, castSecs: a.castSecs || spell.castSecs || 0 };
    }
    // A certain caster owns this press: start (or keep) their cooldown.
    const a = ev.attr;
    if (a.caster && a.basis !== 'candidates') {
      const k = lc(a.caster);
      const pressAt = a.basis === 'own_log' ? a.pressAt : ev.at - (Number(a.castSecs) || 0) * 1000;
      const st = holderState.get(k);
      if (!st || pressAt > st.pressAt) {
        holderState.set(k, {
          ready_at: mgbReadyAt(a.basis, { activationMs: pressAt, landingMs: ev.at, castSecs: a.castSecs }),
          last_spell: ev.spell || spell.name || null, basis: a.basis, pressAt,
        });
      } else if (st && !st.last_spell) st.last_spell = ev.spell || spell.name || null;
    }
  }

  // members: Set(lower names of the caller's raid) | null for "no raid split, everyone".
  async function board({ members } = {}) {
    deps.loadSpells();
    await scan();
    const rows = await Promise.resolve(deps.rosterRows()).catch(() => null);
    const idx = rosterIndex(rows);
    const trained = await Promise.resolve(deps.trainedSet()).catch(() => new Set());
    const inRaid = (k) => !members || members.has(k);
    const holders = [];
    for (const [k, r] of idx) if (trained.has(k) && inRaid(k)) holders.push({ name: r.name, class: r.class || null });
    holders.sort((a, b) => a.name.localeCompare(b.name));

    const mine = events.filter(e => !members || e.targets.filter(n => members.has(lc(n))).length * 2 >= e.targets.length);
    for (const e of mine.slice().sort((a, b) => a.at - b.at)) await settle(e, holders);

    const n = now();
    return {
      now: iso(n),
      mgbs: mine.slice().sort((a, b) => b.at - a.at).map(e => ({
        at: iso(e.at), spell: e.spell || (deps.spellInfo(e.spell_id) || {}).name || null, spell_id: e.spell_id,
        targets: e.targets.length, groups: e.groups.length,
        caster: e.attr && e.attr.caster ? e.attr.caster : null,
        basis: e.attr ? e.attr.basis : 'candidates',
        candidates: e.attr ? e.attr.candidates : [],
      })),
      holders: holders.map(h => {
        const st = holderState.get(lc(h.name));
        return { name: h.name, class: h.class, ready_at: st ? iso(st.ready_at) : null, last_spell: st ? st.last_spell : null, basis: st ? st.basis : null };
      }),
    };
  }

  return { noteLandings, noteActivation, board, scan, _state: () => ({ events, ring, ownLog, holderState }) };
}

// The production deps: the spell catalog (group + beneficial spells only, one paged read an hour), a spell's classes from
// the spell_class_levels view (cached per id), and raid_casts around a landing. Reads happen on a board poll or a
// detected MGB, never per ingested row.
function supabaseDeps({ supabase, guildId, trainedSet, rosterRows }) {
  const spells = new Map();   // id → { name, castSecs }
  const classes = new Map();  // id → Set(classKey) | null
  let loadedAt = 0, loading = false;
  const TTL = 60 * 60 * 1000;
  const enc = encodeURIComponent;
  return {
    spellInfo: (id) => spells.get(Number(id)) || null,
    loadSpells() {
      if (loading || Date.now() - loadedAt < TTL) return;
      loading = true;
      supabase.selectAllPaged('eqemu_spells', 'select=id,name,cast_time&targettype=in.(3,41)&good_effect=eq.1', 'id')
        .then((rows) => {
          if (!Array.isArray(rows)) { loadedAt = Date.now() - TTL + 60_000; return; }
          spells.clear();
          for (const r of rows) if (r && r.id != null) spells.set(Number(r.id), { name: r.name, castSecs: Math.round((Number(r.cast_time) || 0) / 100) / 10 });
          loadedAt = Date.now();
        })
        .catch(() => { loadedAt = Date.now() - TTL + 60_000; })
        .finally(() => { loading = false; });
    },
    async spellClasses(id) {
      if (classes.has(id)) return classes.get(id);
      const rows = await supabase.select('spell_class_levels', `spell_id=eq.${Number(id)}&select=class_key`).catch(() => null);
      if (!Array.isArray(rows)) return null;   // a failed read is not "no class": ask again next time
      const set = rows.length ? new Set(rows.map(r => classKey(r.class_key))) : null;
      classes.set(id, set);
      return set;
    },
    castsNear: (spell, fromMs, toMs) => supabase.select('raid_casts',
      `guild_id=eq.${enc(guildId)}&spell=eq.${enc(spell || '')}&cast_at=gte.${enc(iso(fromMs))}&cast_at=lte.${enc(iso(toMs))}`
      + '&select=caster,spell,cast_at,cast_secs&limit=50'),
    trainedSet, rosterRows,
  };
}

module.exports = { create, supabaseDeps, detectMgbs, attribute, mgbReadyAt, MGB_REUSE_S, ACTIVATION_TEXT };
