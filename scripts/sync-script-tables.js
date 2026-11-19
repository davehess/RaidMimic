#!/usr/bin/env node
/**
 * Load data/quest-scripted.json into eqemu_script_spawns, eqemu_script_loot and eqemu_script_rewards.
 *
 *   node scripts/sync-script-tables.js
 *
 * The JSON is the extractor's joined output (scripts/quest-scripted-extract.js, then the audit's read-only joins;
 * docs/AUDIT-quest-script-gaps-2026-11-19.md "Method"). This script does not re-read the quests repo: it
 * replaces the tables' rows with what the committed file says. Upsert first, then delete the rows whose
 * source_sha is older, so a failed run leaves the previous rows in place. Rows are mirrors, like eqemu_quest_scripts:
 * a script line that no longer exists is "no longer true", not "retention expired".
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required), QUEST_SCRIPTED_FILE (default data/quest-scripted.json)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const md5 = (parts) => crypto.createHash('md5').update(JSON.stringify(parts)).digest('hex');

// Duplicate rows (one script line that lists the same thing twice) collapse onto one key.
function dedupe(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.row_key, r);
  return [...m.values()];
}

function spawnRows(d, sha) {
  const rows = (d.spawns || []).map(s => ({
    row_key: md5(['s', s.script, s.npc_id, s.x, s.y, s.z, s.heading, s.coords_expr, s.npc_expr, s.trigger, s.api]),
    zone_short: s.zone, npc_id: s.npc_id ?? null, npc_name: s.npc_name ?? null,
    x: s.x ?? null, y: s.y ?? null, z: s.z ?? null, heading: s.heading ?? null,
    loc_kind: s.loc ?? null, api: s.api ?? null, script_ref: s.script, trigger: s.trigger ?? null,
    db_state: s.db ?? null, is_ref: false, source_sha: sha,
  }));
  const refs = (d.script_refs || []).map(s => ({
    row_key: md5(['r', s.script, s.npc_id]),
    zone_short: s.zone, npc_id: s.npc_id ?? null, npc_name: s.npc_name ?? null,
    x: null, y: null, z: null, heading: null, loc_kind: null, api: null, script_ref: s.script, trigger: null,
    db_state: s.db ?? null, is_ref: true, source_sha: sha,
  }));
  return dedupe([...rows, ...refs]);
}

function lootRows(d, sha) {
  return dedupe((d.loot || []).filter(l => l.item_id != null).map(l => ({
    row_key: md5(['l', l.script, l.npc_id, l.item_id, l.how]),
    zone_short: l.zone, npc_id: l.npc_id ?? null, item_id: l.item_id, item_name: l.item_name ?? null,
    script_ref: l.script, how: l.how ?? null, source_sha: sha,
  })));
}

// One row per reward call and item; a call with only exp or coin is one row with item_id null.
function rewardRows(d, sha) {
  const out = [];
  for (const r of d.rewards || []) {
    const ids = r.item_ids && r.item_ids.length ? r.item_ids : [null];
    for (const item_id of ids) {
      out.push({
        row_key: md5(['w', r.script, r.kind, item_id, r.exp, r.coin, r.gives_for]),
        zone_short: r.zone, npc_id: r.npc_id ?? null, npc_name: r.npc_name ?? null, kind: r.kind,
        item_id, item_name: r.item_name ?? null, choice: !!(r.choice_of && r.choice_of.length > 1),
        exp: r.exp ?? null, coin: r.coin ?? null, gives_for: r.gives_for ?? null,
        script_ref: r.script, source_sha: sha,
      });
    }
  }
  return dedupe(out);
}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const file = process.env.QUEST_SCRIPTED_FILE || path.join(__dirname, '..', 'data', 'quest-scripted.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sha = d.source && d.source.sha;
  if (!sha) throw new Error('data file has no source.sha');

  const sb = async (pathname, opts = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${pathname}`, {
      ...opts,
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase ${opts.method || 'GET'} ${pathname} -> ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  const tables = {
    eqemu_script_spawns: spawnRows(d, sha),
    eqemu_script_loot: lootRows(d, sha),
    eqemu_script_rewards: rewardRows(d, sha),
  };

  // Item names the file lacks, from the mirror (read in chunks; the catalog is the authority on names).
  const need = new Set();
  for (const t of ['eqemu_script_loot', 'eqemu_script_rewards']) for (const r of tables[t]) if (r.item_id && !r.item_name) need.add(r.item_id);
  const names = new Map();
  const ids = [...need];
  for (let i = 0; i < ids.length; i += 150) {
    const page = await sb(`/eqemu_items?select=id,name&id=in.(${ids.slice(i, i + 150).join(',')})`);
    for (const r of page || []) names.set(r.id, r.name);
  }
  for (const t of ['eqemu_script_loot', 'eqemu_script_rewards']) for (const r of tables[t]) if (r.item_id && !r.item_name) r.item_name = names.get(r.item_id) ?? null;

  const summary = [];
  for (const [table, rows] of Object.entries(tables)) {
    for (let i = 0; i < rows.length; i += 500) {
      await sb(`/${table}?on_conflict=row_key`, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: rows.slice(i, i + 500),
      });
    }
    // Only after every chunk landed: drop what an older read of the scripts left behind.
    await sb(`/${table}?source_sha=neq.${encodeURIComponent(sha)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    summary.push(`${rows.length} ${table.replace('eqemu_script_', '')}`);
    console.log(`  ${table}: ${rows.length} rows at ${sha.slice(0, 7)}`);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `script_tables_summary=${summary.join(', ')}\n`);
  console.log(`Script tables synced: ${summary.join(', ')}`);
}

module.exports = { spawnRows, lootRows, rewardRows };
if (require.main === module) main().catch(err => { console.error('FATAL:', err); process.exit(1); });
