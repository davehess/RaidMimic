// Shape of data/quest-scripted.json (what the server's quest scripts do that our eqemu_* copy cannot show;
// docs/AUDIT-quest-script-gaps-2026-11-19.md). Pure data checks: ids numeric, every row cites a script file:line.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const data = JSON.parse(readFileSync(fileURLToPath(new URL('../data/quest-scripted.json', import.meta.url)), 'utf8'));
const REF = /^[A-Za-z0-9_#.\-/ ,']+\.lua:\d+$/;
const DB = ['placed', 'no_spawn_rows', 'spawngroup_without_spawn2', 'not_in_npc_types'];
const num = (v) => typeof v === 'number' && Number.isFinite(v);

describe('data/quest-scripted.json', () => {
  it('names its source: repo, a 40-hex sha and the date read', () => {
    expect(data.source.repo).toBe('SecretsOTheP/quests');
    expect(data.source.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(data.source.read_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has the four sections, non-empty', () => {
    for (const k of ['spawns', 'script_refs', 'loot', 'timer_overrides', 'notes']) {
      expect(Array.isArray(data[k]), k).toBe(true);
      expect(data[k].length, k).toBeGreaterThan(0);
    }
  });

  it('every spawn cites its script and carries numeric ids and coordinates where literal', () => {
    for (const s of data.spawns) {
      expect(s.script, JSON.stringify(s)).toMatch(REF);
      expect(typeof s.zone).toBe('string');
      expect(['spawn2', 'unique_spawn']).toContain(s.api);
      if (s.npc_id === null) {
        expect(typeof s.npc_expr).toBe('string');
        expect(s.db).toBeNull();
      } else {
        expect(num(s.npc_id), s.script).toBe(true);
        expect(DB).toContain(s.db);
      }
      if (s.loc === 'fixed') {
        for (const k of ['x', 'y', 'z']) expect(num(s[k]), s.script + ' ' + k).toBe(true);
        expect(s.heading === null || num(s.heading), s.script + ' heading (null when the script omits it)').toBe(true);
      }
      else expect(typeof s.coords_expr).toBe('string');
    }
  });

  it('script_refs and loot rows have numeric ids and a script reference', () => {
    for (const r of data.script_refs) {
      expect(num(r.npc_id)).toBe(true);
      expect(r.script).toMatch(REF);
      expect(['no_spawn_rows', 'spawngroup_without_spawn2']).toContain(r.db);
    }
    for (const l of data.loot) {
      expect(num(l.item_id)).toBe(true);
      expect(l.npc_id === null || num(l.npc_id)).toBe(true);
      expect(l.script).toMatch(REF);
      expect(l.how.length).toBeGreaterThan(0);
    }
    for (const t of data.timer_overrides) {
      expect(['update_spawn_timer', 'spawn_condition']).toContain(t.call);
      expect(t.script).toMatch(REF);
    }
  });

  it('keeps the earth-ring trap table reachable: the Ancient Vekerchiki Champion is a reference, not a spawn call', () => {
    expect(data.script_refs.some((r) => r.npc_id === 218382 && r.script.startsWith('poeartha/encounters/Traps.lua'))).toBe(true);
  });

  it('names no member: notes and trigger text stay about scripts', () => {
    expect(JSON.stringify(data.notes)).not.toMatch(/guild lead/i);
  });
});
