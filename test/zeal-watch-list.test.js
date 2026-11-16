// test/zeal-watch-list.test.js — the Zeal watch list (the guild lead, 2026-11-15, "Watch list" pick):
// saved sources, each set to newest, pinned or pre-releases. Runs the real zealUpdater functions; the
// release-picking function is pure, so no network is stubbed for it.
//
// Run: npx vitest run test/zeal-watch-list.test.js

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const zu = require('../apps/mimic/zealUpdater.js');

const rel = (tag, at, extra = {}) => ({ tag_name: tag, published_at: at, ...extra });
const LIST = [
  rel('v1.5.1-alpha', '2026-11-10T00:00:00Z', { prerelease: true }),
  rel('v1.5.0-draft', '2026-11-12T00:00:00Z', { draft: true }),
  rel('v1.4.8', '2026-10-01T00:00:00Z'),
  rel('v1.4.7', '2026-09-01T00:00:00Z'),
];

describe('pickRelease', () => {
  it('newest skips pre-releases and drafts', () => {
    expect(zu.pickRelease(LIST, { mode: 'newest' }).tag_name).toBe('v1.4.8');
  });
  it('pre takes the newest of any kind, still not a draft', () => {
    expect(zu.pickRelease(LIST, { mode: 'pre' }).tag_name).toBe('v1.5.1-alpha');
  });
  it('pinned takes exactly that tag, with or without the v, any case', () => {
    expect(zu.pickRelease(LIST, { mode: 'pinned', pin: '1.4.7' }).tag_name).toBe('v1.4.7');
    expect(zu.pickRelease(LIST, { mode: 'pinned', pin: 'V1.5.1-ALPHA' }).tag_name).toBe('v1.5.1-alpha');
  });
  it('pinned to a missing tag, or a draft, or with no tag, picks nothing', () => {
    expect(zu.pickRelease(LIST, { mode: 'pinned', pin: 'v9.9.9' })).toBeNull();
    expect(zu.pickRelease(LIST, { mode: 'pinned', pin: 'v1.5.0-draft' })).toBeNull();
    expect(zu.pickRelease(LIST, { mode: 'pinned', pin: '' })).toBeNull();
  });
  it('picks the same release whatever order the list arrives in', () => {
    expect(zu.pickRelease([...LIST].reverse(), { mode: 'newest' }).tag_name).toBe('v1.4.8');
    expect(zu.pickRelease([...LIST].reverse(), { mode: 'pre' }).tag_name).toBe('v1.5.1-alpha');
  });
  it('an empty or odd list picks nothing, and an unknown mode acts as newest', () => {
    expect(zu.pickRelease([], { mode: 'newest' })).toBeNull();
    expect(zu.pickRelease(null, { mode: 'pre' })).toBeNull();
    expect(zu.pickRelease(LIST, { mode: 'whatever' }).tag_name).toBe('v1.4.8');
  });
});

describe('cleanWatch and _zealSource', () => {
  const good = { id: 'a1', repo: 'owner/Zeal', mode: 'pre' };
  it('keeps a valid entry, defaults the label, drops bad repos, repeat ids and tagless pins', () => {
    const out = zu.cleanWatch([good, { ...good }, { id: 'b', repo: 'not a repo' }, { id: 'c', repo: 'o/z', mode: 'pinned' },
      { id: 'd', repo: 'o/z', mode: 'pinned', pin: 'v1' }, null, 'x']);
    expect(out.map(w => w.id)).toEqual(['a1', 'd']);
    expect(out[0].label).toBe('owner/Zeal');
  });
  it('a watch source only counts while its entry exists', () => {
    expect(zu._zealSource('w:a1', [good])).toBe('w:a1');
    expect(zu._zealSource('w:a1', [])).toBe('official');
    expect(zu._zealSource('w:a1')).toBe('official');
    expect(zu._zealSource('test', [])).toBe('test');
  });
});

describe('uifiles/default is never overwritten by a Zeal zip', () => {
  const eq = path.join('X', 'EQ');
  it('skips anything under uifiles/default, at any nesting or case', () => {
    expect(zu._destFor(eq, 'uifiles/default/EQUI_Inventory.xml')).toBeNull();
    expect(zu._destFor(eq, 'zeal_v1.5/uifiles/Default/x.tga')).toBeNull();
    expect(zu._destFor(eq, 'uifiles\\DEFAULT\\a\\b.xml')).toBeNull();
  });
  it('still installs the rest of uifiles and Zeal.asi', () => {
    expect(zu._destFor(eq, 'uifiles/zeal/targetrings/a.tga')).toBe(path.join(eq, 'uifiles', 'zeal', 'targetrings', 'a.tga'));
    expect(zu._destFor(eq, 'uifiles/defaultish/a.xml')).toBe(path.join(eq, 'uifiles', 'defaultish', 'a.xml'));
    expect(zu._destFor(eq, 'Zeal.asi')).toBe(path.join(eq, 'Zeal.asi'));
  });
});

describe('wiring', () => {
  const read = p => stripJs(fs.readFileSync(new URL('../apps/mimic/' + p, import.meta.url), 'utf8'));
  it('the list is saved through one IPC that cleans it, and Settings draws and removes entries', () => {
    expect(read('preload.js')).toMatch(/zealWatchSave:.*'zeal-watch-save'/);
    expect(read('main.js')).toMatch(/cfg\.zealWatch = zealUpdater\.cleanWatch\(list\)/);
    const st = read('settings.html');
    expect(st).toMatch(/id="zealWatchAdd"/);
    expect(st).toMatch(/window\.mimic\.zealWatchSave\(list\)/);
    expect(st).toMatch(/data-zw-del/);
  });
});
