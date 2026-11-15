// test/hub-characters-paste.test.js — raidmimic.com "My characters": the paste box, the hourly import limit, the zone view.
//
// Behaviour tests on hostile input. A paste goes through pasteToFile (caps first, then the reader) and then the SAME
// importExports the file upload uses, against a fake store, so what would be written is what is asserted. Names are invented.
//
// Run: npx vitest run test/hub-characters-paste.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_source-slice.js';
import { pasteToFile, importExports, normalizeText, parseExportFile, MAX_PASTE_BYTES, MAX_PASTE_LINES } from '../web/lib/hubImport.ts';
import { importAllowed, MAX_IMPORTS_PER_HOUR } from '../web/lib/hubImportLimit.ts';
import { characterView, zoneEntry, matrixRows } from '../web/lib/hubCharactersView.ts';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const fx = (n) => fs.readFileSync(path.join(ROOT, 'test', 'fixtures', n), 'utf8');
const popflags = fx('popflags-real-a.txt');
const seer = fx('seer-recital-real-b.txt');

function fakeStore() {
  const s = { chars: [], flags: [] };
  const deps = {
    playerId: 'p-me', discordId: '111', now: () => NOW,
    heldNames: async () => [],
    wolfpackOwners: async () => new Map(),
    holders: async () => new Map(),
    insertCharacters: async (rows) => { s.chars.push(...rows); return null; },
    touchCharacters: async () => null,
    flipContested: async () => null,
    insertFlags: async (rows) => { s.flags.push(...rows); return null; },
  };
  return { s, deps };
}
async function run(name, paste) {
  const made = pasteToFile(name, paste, NOW);
  if (!made.ok) return { made };
  const { s, deps } = fakeStore();
  const r = await importExports([made.file], deps);
  return { made, r, s };
}

describe('a valid paste', () => {
  it('the #popflags lines become the same flags the file upload stores', async () => {
    const { made, r, s } = await run('Aldenmar', popflags);
    expect(made.ok).toBe(true);
    expect(r.characters).toMatchObject([{ character: 'Aldenmar', status: 'saved' }]);
    expect(s.chars).toEqual([{ player_id: 'p-me', name: 'Aldenmar', name_lc: 'aldenmar', proof: 'claimed' }]);
    expect(s.flags.length).toBeGreaterThan(5);
    expect(s.flags.every(f => f.player_id === 'p-me' && f.earned_at === new Date(NOW).toISOString())).toBe(true);
  });

  it('the Seer recital works too, and stores catalog keys only', async () => {
    const { made, r, s } = await run('Brackwyn', seer);
    expect(made.ok).toBe(true);
    expect(r.ok && r.characters[0].status).toBe('saved');
    expect(s.flags.length).toBeGreaterThan(3);
    expect(s.flags.map(f => f.flag_key)).toContain('aerindar_dead');
  });

  it('CRLF line endings read the same as LF', async () => {
    const a = await run('Aldenmar', popflags);
    const b = await run('Aldenmar', popflags.replace(/\n/g, '\r\n'));
    expect(b.s.flags.map(f => f.flag_key)).toEqual(a.s.flags.map(f => f.flag_key));
  });

  it('duplicate lines add no duplicate rows', async () => {
    const once = await run('Aldenmar', popflags);
    const twice = await run('Aldenmar', popflags + '\n' + popflags);
    const keys = twice.s.flags.map(f => f.flag_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(once.s.flags.length);
  });

  it('a whole Zeal file pasted: the name comes from the header when the box is empty', async () => {
    const file = `Character\tCorvale\nTimestamp\t2026-11-14_20-00-00\n---\n${popflags}`;
    const { made, s } = await run('', file);
    expect(made.ok).toBe(true);
    expect(s.chars[0].name).toBe('Corvale');
    expect(s.flags[0].earned_at).toBe('2026-11-14T20:00:00.000Z');
  });
});

describe('hostile input', () => {
  const sql = `'; drop table hub_flags; --`;
  const html = '<script>alert(1)</script><img src=x onerror=alert(1)>';

  it('SQL- and HTML-looking lines are never stored or echoed; only a count comes back', async () => {
    const { made, r, s } = await run('Aldenmar', [sql, html, popflags, `Robert'); DROP TABLE hub_characters;--`].join('\n'));
    expect(made.ok).toBe(true);
    // what is stored, and what the action hands back to the browser (the result plus the count)
    const everything = JSON.stringify([s, r, made.unrecognised]);
    expect(everything).not.toMatch(/drop table/i);
    expect(everything).not.toMatch(/<script|onerror/i);
    expect(made.unrecognised).toBeGreaterThanOrEqual(3);
    expect(typeof made.unrecognised).toBe('number');
    // every stored key is a catalog key: a plain identifier, never a pasted line
    expect(s.flags.every(f => /^[a-z0-9_]+$/.test(f.flag_key))).toBe(true);
  });

  it('a paste of only junk is refused with a plain message that does not repeat it', () => {
    const made = pasteToFile('Aldenmar', `${sql}\n${html}`, NOW);
    expect(made.ok).toBe(false);
    expect(made.error).not.toMatch(/drop|script/i);
  });

  it('refuses 70 KB before parsing', () => {
    const made = pasteToFile('Aldenmar', popflags + '\n' + 'x'.repeat(70 * 1024), NOW);
    expect(made).toMatchObject({ ok: false });
    expect(made.error).toMatch(/too much text/);
    expect(MAX_PASTE_BYTES).toBe(64 * 1024);
  });

  it('refuses 900 lines before parsing, accepts 800', () => {
    expect(pasteToFile('Aldenmar', Array(900).fill('a').join('\n'), NOW).error).toMatch(/too many lines/);
    const ok800 = pasteToFile('Aldenmar', popflags + '\n'.repeat(MAX_PASTE_LINES - popflags.split('\n').length), NOW);
    expect(ok800.ok).toBe(true);
  });

  it('refuses binary / NUL bytes', () => {
    const made = pasteToFile('Aldenmar', popflags + '\u0000\u0001\u0002', NOW);
    expect(made).toMatchObject({ ok: false });
  });

  it('a header whose name differs from the field is refused', () => {
    const file = `Character\tCorvale\nTimestamp\t2026-11-14_20-00-00\n---\n${popflags}`;
    const made = pasteToFile('Rethlan', file, NOW);
    expect(made).toMatchObject({ ok: false });
    expect(made.error).toMatch(/name/);
  });

  it('a header with a future timestamp is refused', () => {
    const file = `Character\tCorvale\nTimestamp\t2027-01-01_00-00-00\n---\n${popflags}`;
    expect(pasteToFile('', file, NOW)).toMatchObject({ ok: false });
  });

  it.each([
    ["Robert'); --"], ['Al'], ['A'.repeat(30)], ['Zarrin2'], ['Zar rin'], [''],
  ])('bad name %j is refused', (name) => {
    const made = pasteToFile(name, popflags, NOW);
    expect(made).toMatchObject({ ok: false });
    expect(made.error).toMatch(/name/i);
  });

  it('empty paste is refused', () => {
    expect(pasteToFile('Aldenmar', '   \n ', NOW)).toMatchObject({ ok: false });
  });
});

describe('the hourly import limit', () => {
  it('lets 20 through and refuses the 21st (stubbed count)', async () => {
    let rows = 0;
    const count = async () => ({ count: rows, error: null });
    const record = async () => { rows++; };
    const results = [];
    for (let i = 0; i < MAX_IMPORTS_PER_HOUR + 1; i++) results.push(await importAllowed(count, record, NOW));
    expect(MAX_IMPORTS_PER_HOUR).toBe(20);
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    expect(results[20]).toBe(false);
    expect(rows).toBe(20);   // the refused one is not recorded
  });

  it('counts only the last hour', async () => {
    let since = '';
    await importAllowed(async s => { since = s; return { count: 0, error: null }; }, async () => {}, NOW);
    expect(Date.parse(since)).toBe(NOW - 3600_000);
  });

  it('fails open when the count cannot be read', async () => {
    expect(await importAllowed(async () => ({ count: null, error: new Error('db down') }), async () => {}, NOW)).toBe(true);
    expect(await importAllowed(async () => { throw new Error('boom'); }, async () => {}, NOW)).toBe(true);
  });

  it('a failed record never changes the answer', async () => {
    expect(await importAllowed(async () => ({ count: 1, error: null }), async () => { throw new Error('x'); }, NOW)).toBe(true);
  });
});

describe('the zone view', () => {
  it('a fresh character can enter tier 1 only, and names what is missing', () => {
    const z = zoneEntry([]);
    expect(z.find(x => x.key === 'justice')).toMatchObject({ open: true, missing: [] });
    const storms = z.find(x => x.key === 'storms');
    expect(storms.open).toBe(false);
    expect(storms.missing.length).toBe(1);
  });

  it('flags from a real paste open the zones they imply', async () => {
    const { s } = await run('Aldenmar', popflags);
    const v = characterView('Aldenmar', 'claimed', s.flags.map(f => ({ flag_key: f.flag_key, earned_at: f.earned_at })));
    expect(v.zones.filter(x => x.open).length).toBeGreaterThan(4);
    expect(v.zones.every(x => x.open === (x.missing.length === 0))).toBe(true);
  });
});

describe('lookalike characters are normalised before matching', () => {
  const base = '=== Tier 2 Progression ===\n--- Plane of Valor ---\nAerin`Dar progression: Halls of Honor access unlocked\nAerin`Dar flag: Complete\n'
    + '=== Tier 1 Progression ===\n--- Plane of Disease ---\nGrummus flag: Complete\nMavuin\'s case: Mavuin\'s case is complete';
  const flagsOf = async (text) => (await run('Aldenmar', text)).s?.flags.map(f => f.flag_key).sort() ?? null;

  it('the plain lines give flags (baseline for the rest)', async () => {
    expect((await flagsOf(base)).length).toBeGreaterThan(0);
  });

  it.each([
    ['curly apostrophe for the backtick', s => s.replace(/`/g, '’')],
    ['left single quote', s => s.replace(/`/g, '‘')],
    ['acute accent', s => s.replace(/`/g, '´')],
    ['modifier apostrophe', s => s.replace(/`/g, 'ʼ')],
    ['NBSP for spaces', s => s.replace(/ /g, ' ')],
    ['thin and ideographic spaces', s => s.replace(/ /g, ' ').replace(/: /g, ':　')],
    ['zero-width characters inside words', s => s.replace(/Complete/g, 'Comp​lete‍﻿')],
    ['runs of spaces', s => s.replace(/ /g, '    ')],
    ['control characters', s => s.replace(/Grummus/g, 'Grum\u0007mus').replace(/\n/g, '\u001b\n')],
    ['CRLF', s => s.replace(/\n/g, '\r\n')],
    ['all of it at once, Discord style', s => s.replace(/`/g, '’').replace(/ /g, ' ').replace(/\n/g, '​\r\n')],
  ])('%s still matches', async (_what, mangle) => {
    const want = await flagsOf(base);
    // control chars are refused by the binary check on RAW text except the ones normalise strips AFTER it; so test those via normaliseText
    if (_what === 'control characters') {
      expect(normalizeText(mangle(base))).toBe(base);
      return;
    }
    expect(await flagsOf(mangle(base))).toEqual(want);
  });

  it('runs of spaces collapse, lines are trimmed, tabs and newlines stay', () => {
    expect(normalizeText('  a    b  \n   c\t d ')).toBe('a b\nc\t d');
  });

  it('en and em dashes become a hyphen, NFKC folds full-width letters', () => {
    expect(normalizeText('a–b—c−d')).toBe('a-b-c-d');
    expect(normalizeText('Ａｌｄｅｎ')).toBe('Alden');
  });

  it('the curly apostrophe maps to the apostrophe, the acute to the backtick', () => {
    expect(normalizeText('Honor’s')).toBe("Honor's");
    expect(normalizeText('Aerin´Dar')).toBe('Aerin`Dar');
  });

  it('the name field is normalised too: fullwidth letters and stray spaces pass, Cyrillic lookalikes do not', () => {
    expect(pasteToFile(' Ａldenmar​ ', popflags, NOW).ok).toBe(true);
    expect(pasteToFile('Аldenmar', popflags, NOW).ok).toBe(false);
  });

  it('a Zeal file with mangled spaces and dashes in its header still reads', () => {
    const file = `Character\tCorvale \r\nTimestamp\t2026-11-14_20-00-00\r\n---\r\n${popflags.replace(/\n/g, '\r\n')}`;
    expect(parseExportFile(file)?.character).toBe('Corvale');
  });
});

describe('the matrix', () => {
  const view = (name, keys) => characterView(name, 'claimed', keys.map(k => ({ flag_key: k, earned_at: '2026-11-15T00:00:00Z' })));
  it('orders characters by flag count, most first, ties by name', () => {
    const rows = matrixRows([view('Zed', ['grummus_dead']), view('Beta', ['grummus_dead', 'behemoth_dead']), view('Alfa', ['grummus_dead']), view('Empty', [])], 'solro');
    expect(rows.map(r => r.name)).toEqual(['Beta', 'Alfa', 'Zed', 'Empty']);
  });
  it('draws one cell per piece of the picked gate, from the real flags', () => {
    const rows = matrixRows([view('Aldenmar', ['cipher_1', 'zeks_6'])], 'solro');
    expect(rows[0].pieces.length).toBeGreaterThan(0);
    expect(rows[0].pieces.some(p => p.state === 'done')).toBe(true);
    expect(matrixRows([view('Aldenmar', [])], 'not-a-gate')[0].pieces.length).toBeGreaterThan(0);
  });
});
