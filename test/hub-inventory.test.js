// test/hub-inventory.test.js — the Raid Mimic character page's inventory and Quarmy upload (web/lib/hubInventory.ts,
// hubInventoryDb.ts; supabase/migrations/20261115230000_hub_inventory.sql). Behaviour tests over a fake store: the two
// file readers produce rows, two players holding the same character name never touch each other's rows, and the size and
// row caps hold. Names are invented.
//
// Run: npx vitest run test/hub-inventory.test.js

import { describe, it, expect } from 'vitest';
import { readSource, ROOT } from './_source-slice.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  readInventoryFile, parseQuarmy, importInventory, MAX_INV_FILE_BYTES, MAX_INV_ROWS, MAX_INV_FILES, MAX_INV_LINES,
} from '../web/lib/hubInventory.ts';
import { replaceRows, loadInventory } from '../web/lib/hubInventoryDb.ts';
import { metaForPath } from '../web/lib/pageMeta.ts';
import { isRaidmimicOpenPath } from '../web/lib/raidmimicHost.ts';
import { isGuildHostOpenPath } from '../web/lib/guildHost.ts';

const INV = [
  'Location\tName\tID\tCount\tSlots',
  'Charm\tCharm of Testing\t1001\t1\t0',
  'Ear\tGold Earring\t1002\t1\t0',
  'Ear\tSilver Earring\t1003\t1\t0',
  'General1\tBackpack of Aldenmar\t1004\t1\t8',
  'General1-Slot1\tRaspberry Tart\t1005\t20\t0',
  'General2\tEmpty\t0\t0\t0',
  'Bank1\tBanked Sword\t1006\t1\t0',
  'SharedBank1\tShared Ring\t1007\t1\t0',
  'General-Coin\tCurrency\t0\t55\t0',
].join('\n');

const QUARMY = [
  'Character\tName\tLastName\tLevel\tClass\tRace\tGender\tDeity\tGuild',
  'Character\tCorvale\t\t60\t3\t1\t0\t140\tNone',
  'Location\tName\tID\tCount\tSlots',
  'Ear\tGold Earring\t1002\t1\t0',
  'Ear\tSilver Earring\t1003\t1\t0',
  'Held\tCursor Thing\t1010\t1\t0',
  'General1\tBackpack\t1004\t1\t8',
  'Bank1\tBanked Sword\t1006\t1\t0',
  'SharedBank1\tShared Ring\t1007\t1\t0',
  'General-Coin\tCurrency\t0\t55\t0',
  'AAIndex\tRank',
  '12\t3',
  'Checksum\tabc123',
].join('\n');

const file = (name, text) => ({ name, text, size: new TextEncoder().encode(text).length });

describe('the two readers turn a small file into rows', () => {
  it('a Zeal inventory file: worn, bags, bank and shared bank kept; empty slots and coin dropped; name from the file name', () => {
    const r = readInventoryFile(file('Corvale-Inventory.txt', INV));
    expect(r.ok).toBe(true);
    expect(r.source).toBe('inventory');
    expect(r.character).toBe('Corvale');
    expect(r.rows.map(x => x.slot_label)).toEqual(['Charm', 'Ear', 'General1', 'General1-Slot1', 'Bank1', 'SharedBank1']);
    const tart = r.rows.find(x => x.slot_label === 'General1-Slot1');
    expect(tart).toEqual({ slot_label: 'General1-Slot1', item_id: 1005, item_name: 'Raspberry Tart', quantity: 20 });
  });

  it('a Quarmy export: name from its Character row, worn + bags only (bank, shared bank, coin, cursor and AAs never read), repeated slots numbered', () => {
    const r = readInventoryFile(file('CorvaleQuarmy.txt', QUARMY));
    expect(r.ok).toBe(true);
    expect(r.source).toBe('quarmy');
    expect(r.character).toBe('Corvale');
    expect(r.rows.map(x => x.slot_label)).toEqual(['Ear1', 'Ear2', 'General1']);
    expect(parseQuarmy(QUARMY).rows.some(x => /Bank|Coin|Held/.test(x.slot_label))).toBe(false);
  });

  it('a name that is not letters only (digits, a lookalike spelling) is refused, never guessed', () => {
    expect(readInventoryFile(file('Corvale2-Inventory.txt', INV)).ok).toBe(false);
    expect(readInventoryFile(file('Corvаle-Inventory.txt', INV)).ok).toBe(false);          // Cyrillic a
    const q = QUARMY.replace('Corvale', 'Corvаle');
    expect(readInventoryFile(file('x.txt', q)).ok).toBe(false);
  });

  it('control characters are refused, and item text is bounded', () => {
    expect(readInventoryFile(file('Corvale-Inventory.txt', INV + '\u0000')).ok).toBe(false);
    const long = INV.replace('Raspberry Tart', 'T'.repeat(500));
    const r = readInventoryFile(file('Corvale-Inventory.txt', long));
    expect(r.rows.find(x => x.slot_label === 'General1-Slot1').item_name.length).toBe(128);
  });
});

describe('the caps', () => {
  it('a file over the byte cap is refused without being parsed', () => {
    const r = readInventoryFile({ name: 'Corvale-Inventory.txt', text: INV, size: MAX_INV_FILE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
  it('more items than the row cap is refused, not truncated', () => {
    const many = ['Location\tName\tID\tCount\tSlots', ...Array.from({ length: MAX_INV_ROWS + 1 }, (_, i) => `Bank${i + 1}\tItem ${i}\t${2000 + i}\t1\t0`)].join('\n');
    expect(readInventoryFile(file('Corvale-Inventory.txt', many)).ok).toBe(false);
    const atCap = ['Location\tName\tID\tCount\tSlots', ...Array.from({ length: MAX_INV_ROWS }, (_, i) => `Bank${i + 1}\tItem ${i}\t${2000 + i}\t1\t0`)].join('\n');
    const r = readInventoryFile(file('Corvale-Inventory.txt', atCap));
    expect(r.ok).toBe(true);
    expect(r.rows.length).toBe(MAX_INV_ROWS);
  });
  it('too many lines is refused', () => {
    const lines = Array.from({ length: MAX_INV_LINES + 5 }, () => '').join('\n');
    expect(readInventoryFile(file('Corvale-Inventory.txt', INV + lines)).ok).toBe(false);
  });
  it('more files than the limit is refused before anything is read', async () => {
    const files = Array.from({ length: MAX_INV_FILES + 1 }, () => file('Corvale-Inventory.txt', INV));
    const r = await importInventory(files, { playerId: 'p1', now: () => 0, heldNames: async () => { throw new Error('read'); }, replace: async () => null });
    expect(r.ok).toBe(false);
  });
  it('quantity and item id are clamped', () => {
    const r = readInventoryFile(file('Corvale-Inventory.txt', 'Location\tName\tID\tCount\tSlots\nCharm\tStack\t99999999999\t99999999\t0'));
    expect(r.rows[0].quantity).toBe(1_000_000);
    expect(r.rows[0].item_id).toBeNull();
  });
});

// A fake of the one table, with the upsert / delete semantics the migration's unique key gives.
function fakeClient() {
  const table = [];
  let id = 0;
  const calls = [];
  const from = (t) => {
    expect(t).toBe('hub_inventory');
    return {
      upsert(rows, opts) {
        calls.push(['upsert', opts.onConflict]);
        for (const r of rows) {
          const hit = table.find(x => x.player_id === r.player_id && x.name_lc === r.name_lc && x.source === r.source && x.slot_label === r.slot_label);
          if (hit) Object.assign(hit, r); else table.push({ id: ++id, ...r });
        }
        return Promise.resolve({ error: null });
      },
      delete() {
        const f = [];
        const q = {
          eq(c, v) { f.push(r => r[c] === v); return q; },
          lt(c, v) { f.push(r => r[c] < v); return q; },
          then(res) {
            calls.push(['delete', f.length]);
            for (let i = table.length - 1; i >= 0; i--) if (f.every(p => p(table[i]))) table.splice(i, 1);
            return Promise.resolve({ error: null }).then(res);
          },
        };
        return q;
      },
      select() {
        const f = []; let range = [0, 999];
        const q = {
          eq(c, v) { f.push(r => r[c] === v); return q; },
          order() { return q; },
          range(a, b) { range = [a, b]; return q; },
          then(res) { return Promise.resolve({ data: table.filter(r => f.every(p => p(r))).slice(range[0], range[1] + 1), error: null }).then(res); },
        };
        return q;
      },
    };
  };
  return { from, table, calls };
}

function depsFor(db, playerId, held, nowMs) {
  return {
    playerId, now: () => nowMs, heldNames: async () => held,
    replace: (pid, lc, character, source, observedAt, rows) => replaceRows(db, pid, lc, character, source, observedAt, rows),
  };
}

describe('per-player keying', () => {
  it('two players with the same character name keep separate rows; one upload never touches the other\'s', async () => {
    const db = fakeClient();
    const a = await importInventory([file('Corvale-Inventory.txt', INV)], depsFor(db, 'player-a', ['corvale'], 1_000), undefined);
    expect(a.ok && a.saved).toEqual([{ character: 'Corvale', source: 'inventory', items: 6 }]);
    const small = 'Location\tName\tID\tCount\tSlots\nCharm\tOther Charm\t3001\t1\t0';
    const b = await importInventory([file('Corvale-Inventory.txt', small)], depsFor(db, 'player-b', ['corvale'], 2_000), undefined);
    expect(b.ok).toBe(true);
    expect(db.table.filter(r => r.player_id === 'player-a').length).toBe(6);
    expect(db.table.filter(r => r.player_id === 'player-b').length).toBe(1);
    // a re-upload by B (fewer items) replaces only B's set
    await importInventory([file('Corvale-Inventory.txt', small.replace('Other Charm', 'Newer Charm'))], depsFor(db, 'player-b', ['corvale'], 3_000));
    expect(db.table.filter(r => r.player_id === 'player-a').length).toBe(6);
    expect(db.table.filter(r => r.player_id === 'player-b').map(r => r.item_name)).toEqual(['Newer Charm']);
    // reads are per player too
    expect((await loadInventory(db, 'player-a', 'corvale'))[0].items.length).toBe(6);
    expect((await loadInventory(db, 'player-b', 'corvale'))[0].items.map(i => i.item_name)).toEqual(['Newer Charm']);
    expect(await loadInventory(db, 'player-c', 'corvale')).toEqual([]);
  });

  it('every row written carries the session player, never a name from the file; a re-upload replaces that set only (inventory vs quarmy are separate)', async () => {
    const db = fakeClient();
    await importInventory([file('Corvale-Inventory.txt', INV), file('CorvaleQuarmy.txt', QUARMY)], depsFor(db, 'player-a', ['corvale'], 1_000));
    expect(new Set(db.table.map(r => r.player_id))).toEqual(new Set(['player-a']));
    expect(db.table.filter(r => r.source === 'quarmy').length).toBe(3);
    await importInventory([file('Corvale-Inventory.txt', INV.replace('Charm of Testing', 'Charm of Retesting'))], depsFor(db, 'player-a', ['corvale'], 2_000));
    expect(db.table.filter(r => r.source === 'quarmy').length).toBe(3);
    expect(db.table.find(r => r.slot_label === 'Charm' && r.source === 'inventory').item_name).toBe('Charm of Retesting');
    expect(db.calls.every(c => c[0] !== 'delete' || c[1] === 4)).toBe(true);   // player, name, source, older-than
  });

  it('a character the player does not hold is not written (no claim happens here)', async () => {
    const db = fakeClient();
    const r = await importInventory([file('Corvale-Inventory.txt', INV)], depsFor(db, 'player-a', ['someoneelse'], 1_000));
    expect(r.ok && r.saved).toEqual([]);
    expect(r.ok && r.problems[0].message).toMatch(/PoP flags first/);
    expect(db.table.length).toBe(0);
  });

  it('the character page\'s own form (only) refuses a file for another character', async () => {
    const db = fakeClient();
    const r = await importInventory([file('Rethlan-Inventory.txt', INV)], depsFor(db, 'player-a', ['corvale', 'rethlan'], 1_000), 'Corvale');
    expect(r.ok && r.saved).toEqual([]);
    expect(r.ok && r.problems[0].message).toMatch(/not this character/);
    expect(db.table.length).toBe(0);
  });

  it('an unreadable held list fails closed', async () => {
    const r = await importInventory([file('Corvale-Inventory.txt', INV)], { playerId: 'p', now: () => 1, heldNames: async () => null, replace: async () => null });
    expect(r.ok).toBe(false);
  });
});

describe('routing and metadata for /characters/<name>', () => {
  it('the raidmimic and guild hosts serve the page as themselves', () => {
    expect(isRaidmimicOpenPath('/characters/Corvale')).toBe(true);
    expect(isGuildHostOpenPath('/characters/Corvale')).toBe(true);
    expect(isRaidmimicOpenPath('/charactersx')).toBe(false);
  });
  it('the card names the page and never the character', () => {
    const m = metaForPath('/characters/Corvale');
    expect(m.title).toBe('Character · Raid Mimic');
    expect(JSON.stringify(m)).not.toMatch(/Corvale/);
    expect(metaForPath('/characters').title).toBe('My characters');
  });
  it('the page and the action only ever key on the session player', () => {
    const page = fs.readFileSync(path.join(ROOT, 'web/app/characters/[name]/page.tsx'), 'utf8');
    expect(page).toMatch(/\.eq\('discord_id', discordId\)/);
    expect(page).toMatch(/loadInventory\(admin, player\.player_id as string, lc\)/);
    expect(readSource(path.join(ROOT, 'web/lib/hubInventoryDb.ts'))).toMatch(/\.delete\(\)\.eq\('player_id', playerId\)/);
  });
});
