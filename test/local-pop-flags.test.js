// test/local-pop-flags.test.js — the PoP flags page on this PC (agent 4.0.95; web/local/app/flags).
//
// The guild lead, 2026-11-16: "We should have Popflags in the local mimic as well." A Raid Mimic player outside the
// guild, or anyone offline, sees their flags from THIS PC only: Zeal's <Name>-PoPFlags.txt, the `#popflags` replies and
// the Seer's recital the log reader kept (local store kind pop_flags). SOURCE-SLICE tier: the real agent code is cut
// out of index.js and run against real files in a temp folder. Names are invented (Aldenmar, Brackwyn, Corvale).
//
// What is pinned: the same step from the file and the store keeps the EARLIEST time; a character with nothing is left
// out; a missing folder is an empty list; a second read of the same file gives the same rows (the upload path's 6 h
// memory is neither starved nor spent); a kept-out character (exclude_from_stats) still shows; the Seer's table is the
// bot's; events land in the store once; and the page, nav and release guard are wired.
//
// Run: npx vitest run test/local-pop-flags.test.js

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { AGENT_INDEX, ROOT, readSource, sliceBlock, stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const src = readSource(AGENT_INDEX);
const tsBlock = sliceBlock(src, 'const TS_RX = ', '  return isNaN(d.getTime()) ? null : d;\n}');
const gateBlock = sliceBlock(src, 'const _POP_GRANT_RX = ', "    ...(kind === 'trial' ? { npc: trialNpc.slice(0, 64) } : {}),\n  };\n}");
const pfBlock = sliceBlock(src, 'const _PF_STAGES = [', '  return { events, found };\n}');
const fpBlock = sliceBlock(src, 'function _fileFingerprint(st) {', '\n');
const optBlock = sliceBlock(src, 'function _rebuildExcluded(character) {', '  return !!(m && modeStopsLog(m.mode));\n}')
  + '\n' + sliceBlock(src, 'function shouldUploadForCharacter(character) {', '  return !p || !p.exclude_from_stats;\n}');
const scanBlock = sliceBlock(src, 'function _pfFileBlocked(lowerName) {', "    } catch { /* unreadable / malformed — skip, retry next scan */ }\n  }\n}");
const rowsBlock = sliceBlock(src, 'const _LOCAL_RECITAL_STAGES = [', '  } catch { void 0; }\n}');
const snapBlock = sliceBlock(src, 'function _localPopFlagsSnapshot(', "  return { ok: true, generated_at: new Date().toISOString(), characters };\n}");

function load(statsOver = {}) {
  const puts = [];
  const w = {
    fs, path, console: { log() {}, warn() {} },
    stats: { characterPrefsCheckedAt: Date.now(), characterPrefs: {}, watchedLogs: [], ...statsOver },
    _raidHold: false, _uploadOpts: {}, _scannedFiles: {}, _saveUploadedStateSoon: () => {}, uploadPopFlags: () => Promise.resolve(),
    _optinState: { characterModes: {} }, modeStopsLog: () => false, _offGuildServerChar: () => false, _isGuestChar: () => false,
    _zealState: {}, _liveFightActive: () => false, AGENT_VERSION: '9.9.9',
    _localStore: { put: (kind, id, rec, o) => { puts.push({ kind, id, rec, o }); return true; } },
  };
  const names = Object.keys(w);
  const body = [tsBlock, gateBlock, pfBlock, fpBlock, optBlock, scanBlock, rowsBlock, snapBlock].join('\n')
    + '\nreturn { popFlagsOutputEvents, popFlagsFileEvents, parsePopFlagsFile, _localPopFlagRows, _localPopFlagsNote, _localPopFlagsSnapshot, _LOCAL_RECITAL_STAGES, _pfState };';
  // eslint-disable-next-line no-new-func
  const M = new Function(...names, body)(...names.map(k => w[k]));
  return { M, puts };
}

const fx = (n) => fs.readFileSync(path.join(ROOT, 'test', 'fixtures', n), 'utf8');
const A = fx('popflags-real-a.txt');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-localpf-'));
afterAll(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* temp dir */ } });

const z2 = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}_${z2(d.getHours())}-${z2(d.getMinutes())}-${z2(d.getSeconds())}`;
const WHEN = new Date(Math.floor((Date.now() - 3600_000) / 1000) * 1000);
const zealFile = (character, body) => [`Character\t${character}`, `Timestamp\t${stamp(WHEN)}`, 'Command\t#popflags, #popflags 1-5', '---', ...body.split('\n').filter(Boolean)].join('\n') + '\n';
let seq = 0;
function eqDir(files = []) {
  const dir = path.join(DIR, 'eq' + (++seq));
  fs.mkdirSync(dir);
  for (const [name, text] of files) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
const keyOf = (c, k) => c.rows.find(r => r.flag_key === k);

describe('_localPopFlagRows: which rows a pop_flag event makes', () => {
  const { M } = load();
  it('a #popflags event makes one row per step key, source popflags, at the event time', () => {
    const ev = M.popFlagsOutputEvents('[Mon Nov 16 20:11:02 2026] Mavuin\'s case: Mavuin\'s case is complete', 'Aldenmar');
    const rows = M._localPopFlagRows(ev);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toMatchObject({ character: 'Aldenmar', source: 'popflags' });
    expect(new Date(rows[0].earned_at).getFullYear()).toBe(2026);
  });
  it("the Seer's sentence is named by the table (a backtick or a doubled space does not matter); a grant makes none", () => {
    const at = '2026-11-16T20:00:00.000Z';
    const rec = (text, extra = {}) => ({ character: 'Brackwyn', kind: 'recital', text, ts: at, ...extra });
    expect(M._localPopFlagRows([rec('You have bested Aerin`Dar and proven yourself honorable enough to continue.')]))
      .toEqual([{ character: 'Brackwyn', flag_key: 'aerindar_2', earned_at: at, source: 'recital' }]);
    expect(M._localPopFlagRows([rec('Milyk  has been saved from certain death, but is not recovering.')])[0].flag_key).toBe('fuirstel_3');
    expect(M._localPopFlagRows([rec('Terris still haunts your nightmares whenever you attemt to recall your battle with her.')])).toEqual([]);   // a pending memory proves no step
    expect(M._localPopFlagRows([{ character: 'Brackwyn', kind: 'grant', text: null, ts: at }])).toEqual([]);
    expect(M._localPopFlagRows([rec('hello there')])).toEqual([]);
  });
  it("the table is the bot's (utils/popFlagStages.js RECITAL_STAGES), entry for entry", () => {
    const bot = require('../utils/popFlagStages.js').RECITAL_STAGES;
    expect(M._LOCAL_RECITAL_STAGES).toEqual(bot);
  });
});

describe('_localPopFlagsNote: the local store gets each step once', () => {
  it('writes kind pop_flags, one id per character + step + time, and a repeat adds nothing', () => {
    const { M, puts } = load();
    const ev = M.popFlagsFileEvents(M.parsePopFlagsFile(zealFile('Corvale', A)), 'Corvale').events;
    M._localPopFlagsNote(ev);
    const first = puts.length;
    expect(first).toBeGreaterThan(5);
    expect(puts.every(p => p.kind === 'pop_flags' && p.id.startsWith('corvale|') && p.rec.source === 'popflags')).toBe(true);
    M._localPopFlagsNote(ev);
    expect(puts.length).toBe(first);
  });
});

describe('_localPopFlagsSnapshot: what the page is given', () => {
  it('a file and a store row for the same step keep the EARLIEST time; the file alone still shows', () => {
    const { M } = load();
    const dir = eqDir([['Aldenmar-PoPFlags.txt', zealFile('Aldenmar', A)]]);
    const fromFile = M._localPopFlagsSnapshot([dir], []).characters[0];
    expect(fromFile.name).toBe('Aldenmar');
    expect(fromFile.export_at).toBe(WHEN.toISOString());
    const [a, b] = fromFile.rows.slice(0, 2).map(r => r.flag_key);
    const stored = [
      { character: 'Aldenmar', flag_key: a, earned_at: '2020-01-02T03:04:05.000Z', source: 'recital' },    // earlier than the file: wins
      { character: 'Aldenmar', flag_key: b, earned_at: '2099-01-01T00:00:00.000Z', source: 'recital' },    // later: the file's time stays
    ];
    const merged = M._localPopFlagsSnapshot([dir], stored).characters[0];
    expect(keyOf(merged, a)).toEqual({ flag_key: a, earned_at: '2020-01-02T03:04:05.000Z', source: 'recital' });
    expect(keyOf(merged, b).earned_at).toBe(WHEN.toISOString());
    expect(merged.rows.length).toBe(fromFile.rows.length);               // no duplicate keys
    expect(new Set(merged.rows.map(r => r.flag_key)).size).toBe(merged.rows.length);
  });
  it('a character known only from the store shows, with no export time; one with nothing at all is left out', () => {
    const { M } = load();
    const dir = eqDir([['Brackwyn-PoPFlags.txt', zealFile('Brackwyn', 'Details: #popflags 1, 2, 3, 4, or 5 (tier1-tier5 also work).')]]);
    const out = M._localPopFlagsSnapshot([dir], [{ character: 'Corvale', flag_key: 'time_1', earned_at: '2026-11-01T00:00:00.000Z', source: 'popflags' }]);
    expect(out.characters.map(c => c.name)).toEqual(['Corvale']);       // Brackwyn's file proves no flag: omitted
    expect(out.characters[0].export_at).toBeNull();
  });
  it('a missing or empty EQ folder, or none at all, is an empty list and never throws', () => {
    const { M } = load();
    expect(M._localPopFlagsSnapshot([path.join(DIR, 'not-here')], [])).toMatchObject({ ok: true, characters: [] });
    expect(M._localPopFlagsSnapshot([], null)).toMatchObject({ ok: true, characters: [] });
    expect(M._localPopFlagsSnapshot([eqDir()], [{ junk: 1 }, null])).toMatchObject({ characters: [] });
  });
  it("reading twice gives the same rows (the upload path's 6 h memory is not what the page reads)", () => {
    const { M } = load();
    const dir = eqDir([['Aldenmar-PoPFlags.txt', zealFile('Aldenmar', A)]]);
    const one = M._localPopFlagsSnapshot([dir], []).characters[0].rows;
    const two = M._localPopFlagsSnapshot([dir], []).characters[0].rows;
    expect(one.length).toBeGreaterThan(5);
    expect(two).toEqual(one);
    expect(M._pfState.has('aldenmar')).toBe(false);                      // and the read left no state behind
  });
  it("a live #popflags read already in the 6 h memory neither starves the page nor loses its memory", () => {
    const { M } = load();
    const dir = eqDir([['Aldenmar-PoPFlags.txt', zealFile('Aldenmar', A)]]);
    for (const l of A.split('\n').filter(Boolean)) M.popFlagsOutputEvents(`[Mon Nov 16 20:11:02 2026] ${l}`, 'Aldenmar');   // the live tail got there first
    const live = M._pfState.get('aldenmar');
    expect(live.sent.size).toBeGreaterThan(5);
    const rows = M._localPopFlagsSnapshot([dir], []).characters[0].rows;
    expect(rows.length).toBeGreaterThan(5);                              // the file is read whole, not deduplicated against the live read
    expect(M._pfState.get('aldenmar')).toBe(live);                       // and the upload path's memory is the same object, untouched
  });
  it('flags are not stats: a character kept out of stats still shows; a renamed copy of another character\'s file does not', () => {
    const { M } = load({ characterPrefs: { corvale: { exclude_from_stats: true } } });
    const dir = eqDir([
      ['Corvale-PoPFlags.txt', zealFile('Corvale', A)],
      ['Rethlan-PoPFlags.txt', zealFile('Corvale', A)],                  // header names Corvale: not Rethlan's file
    ]);
    const out = M._localPopFlagsSnapshot([dir], []);
    expect(out.characters.map(c => c.name)).toEqual(['Corvale']);
  });
  it('the newest file wins across folders and host-tagged copies', () => {
    const { M } = load();
    const older = eqDir([['Aldenmar-PoPFlags.txt', zealFile('Aldenmar', 'Tier 1: Complete')]]);
    const newer = eqDir([['Aldenmar-PoPFlags_Quarm.txt', zealFile('Aldenmar', A).replace(`Timestamp\t${stamp(WHEN)}`, `Timestamp\t${stamp(new Date(WHEN.getTime() + 60_000))}`)]]);
    const c = M._localPopFlagsSnapshot([older, newer], []).characters[0];
    expect(c.export_at).toBe(new Date(WHEN.getTime() + 60_000).toISOString());
  });
});

describe('wiring', () => {
  const code = stripJs(src);
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  it('the route sits behind the local-request guard, next to the inventory one, and the store keeps 400 days / 5 MB', () => {
    const guard = code.indexOf('if (_localGuardBlock(req, res)) return;');
    const route = code.indexOf("'/api/local/pop-flags') return _handleLocalPopFlags(req, res);");
    expect(guard).toBeGreaterThan(0);
    expect(route).toBeGreaterThan(guard);
    expect(code).toMatch(/pop_flags:\s+\{ retainDays: 400, maxBytes: 5 \* _LSTORE_MB \}/);
  });
  it('both delivery paths feed the store: the upload call and the rescan when nothing may leave', () => {
    expect(code).toMatch(/_localPopFlagsNote\(events\);[^\n]*\n\s*enqueueUpload\('pop_flag'/);
    expect(code).toMatch(/if \(!mode\.upload\) \{ _localPopFlagsNote\(evs\); return; \}/);
  });
  it('the page, the nav, /me, the tray, the dashboard rail and the release guards all name it', () => {
    const page = stripJs(read('web/local/app/flags/LocalFlags.tsx'));
    expect(page).toMatch(/from '@\/lib\/hubCharactersView'/);
    expect(page).toMatch(/\bcharacterView\b/);
    expect(page).toMatch(/\boverallRows\b/);
    expect(page).toContain("fetch('/api/local/pop-flags'");
    expect(stripJs(read('web/local/app/LocalNav.tsx'))).toMatch(/\{ href: '\/flags\/',\s+label: 'PoP flags', icon: '🗺️' \}/);
    expect(stripJs(read('web/local/app/me/page.tsx'))).toContain("href: '/flags/'");
    expect(stripJs(read('apps/mimic/main.js'))).toMatch(/openLocalSite\('flags'\)/);
    expect(read('packages/wolfpack-logsync/dashboard.html')).toMatch(/onclick="wpOpenLocalSite\('flags'\)"/);
    for (const wf of ['release-mimic', 'build-mimic-linux', 'build-mimic-win7']) {
      expect(read(`.github/workflows/${wf}.yml`), wf).toMatch(/test -f out\/flags\/index\.html/);
    }
  });
});
