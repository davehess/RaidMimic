// test/sync-items-mod2-stats.test.js — the "mod2" item stats (Quarm patch 2026-11-23, EQMacEmu 7d54c5a).
// The transform is run for real; the migration is checked as text on stripSql.
// Run: npx vitest run test/sync-items-mod2-stats.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readSource, stripSql } from './_source-slice.js';

const require = createRequire(import.meta.url);
const sync = require('../scripts/sync-from-eqmac.js');
const MIG = stripSql(readSource(path.join(ROOT, 'supabase', 'migrations', '20261123120000_eqemu_items_mod2.sql')));
const MOD2 = ['strikethrough', 'stunresist', 'combateffects', 'accuracy', 'avoidance', 'spellshield', 'shielding'];

describe('eqemu_items mod2 stats', () => {
  it('carries the seven mod2 columns and damageshield from the dump row, in any column order', () => {
    const cols = ['id', 'name', 'damageshield', ...MOD2];
    const out = sync.TRANSFORMS.items(cols, [15805, 'Corvale Shroud', 5, 0, 4, 0, 15, 20, 6, 4]);
    expect(out).toMatchObject({ id: 15805, damageshield: 5, strikethrough: 0, stunresist: 4, combateffects: 0, accuracy: 15, avoidance: 20, spellshield: 6, shielding: 4 });
  });

  it('a dump without the columns leaves them undefined, so a stored value is never nulled', () => {
    const sent = JSON.parse(JSON.stringify(sync.TRANSFORMS.items(['id', 'name'], [1, 'Old Dump Item'])));
    for (const k of [...MOD2, 'damageshield']) expect(sent, k).not.toHaveProperty(k);
  });

  it('the migration adds the seven columns as smallint not null default 0, idempotently', () => {
    for (const c of MOD2) expect(MIG).toMatch(new RegExp(`add column if not exists ${c}\\s+smallint not null default 0`));
    expect(MIG).not.toMatch(/add column if not exists damageshield/);
  });

  it('seeds the 63 upstream rows, with Shroud of Eternity on the existing damageshield column and no worneffect change', () => {
    expect(MIG.match(/^update public\.eqemu_items set /gim)).toHaveLength(63);
    expect(MIG).toMatch(/set shielding = 4, damageshield = 5 where id = 15805;/);
    expect(MIG).not.toMatch(/worneffect/);
  });
});
