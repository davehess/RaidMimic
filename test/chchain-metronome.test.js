// test/chchain-metronome.test.js — the CH chain overlay's metronome.
//
// The guild lead, 2026-11-25: "implement a metronome for the CH overlay so that I can set what the delay is and a metronome
// watching for the previous number". ⚙ → Metronome, after #N, wait S s: N's call starts a countdown that clicks each second
// and ends in GO.
//
// metroPhase and metroUpdate run as shipped, with a stub page and a recorded click.
//
// Mutation-checked (by hand, 2026-11-25): drop the "older than the wait + 1 s" guard and "an old call at load starts nothing"
// fails; click on every render instead of on each new second and "one click per second" fails.
//
// Run: npx vitest run test/chchain-metronome.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, stripCss, ROOT } from './_source-slice.js';

const SRC = readSource(path.join(ROOT, 'apps', 'mimic', 'chchain.html'));
const BLOCK = sliceBlock(SRC, '  var METRO_GO_SHOW_MS = 2000;', '\n  function metroUpdate(c, now) {');
const UPDATE = sliceBlock(SRC, '  function metroUpdate(c, now) {', "      el.className = 'metro'; el.textContent = '♩ waiting for #' + M.after + ' · ' + (M.waitMs / 1000).toFixed(1) + 's after';\n    }\n  }");

function boot({ on = true, after = 2, wait = 3 } = {}) {
  const el = { style: {}, className: '', textContent: '' };
  const clicks = [];
  const store = { chchain_metro_on: on ? '1' : '0', chchain_metro_after: String(after), chchain_metro_wait: String(wait) };
  const f = new Function('document', 'localStorage', 'window',
    BLOCK.replace('\n  function metroUpdate(c, now) {', '') + '\n' + UPDATE.replace(/function metroClick[\s\S]*?\n  \}\n/, '')
    + '\nreturn { metroPhase, metroUpdate, metroSlot, M };');
  const api = f({ getElementById: () => el }, { getItem: (k) => store[k] ?? null }, {});
  return { api, el, clicks };
}
const chain = (n, at) => ({ slots: { [n]: { lastAtMs: at } } });

describe('metroPhase', () => {
  const { api } = boot();
  it('waits with no call, counts down after one, shows GO for 2 s, then waits again', () => {
    expect(api.metroPhase(0, 3000, 10).phase).toBe('wait');
    expect(api.metroPhase(1000, 3000, 1500)).toEqual({ phase: 'count', remMs: 2500, sec: 3 });
    expect(api.metroPhase(1000, 3000, 3100)).toEqual({ phase: 'count', remMs: 900, sec: 1 });
    expect(api.metroPhase(1000, 3000, 4000).phase).toBe('go');
    expect(api.metroPhase(1000, 3000, 5999).phase).toBe('go');
    expect(api.metroPhase(1000, 3000, 6000).phase).toBe('wait');
  });
});

describe('metroSlot: what you type in "after #"', () => {
  const { api } = boot();
  it('4, 04, and the chain\'s own 444 or 44 all mean slot 4; 12 is 12; nonsense is null', () => {
    for (const v of ['4', '04', '444', '44']) expect(api.metroSlot(v)).toBe(4);
    expect(api.metroSlot('12')).toBe(12);
    for (const v of ['0', '000', '31', '1234', 'x', '']) expect(api.metroSlot(v)).toBeNull();
  });
});

describe('metroUpdate', () => {
  it('reads its saved settings', () => {
    const { api } = boot({ after: 4, wait: 2.5 });
    expect(api.M).toMatchObject({ on: true, after: 4, waitMs: 2500 });
  });
  it('hidden while off', () => {
    const { api, el } = boot({ on: false });
    api.metroUpdate(chain(2, 1000), 1000);
    expect(el.style.display).toBe('none');
  });
  it('waits for the number it follows; another number does nothing', () => {
    const { api, el } = boot();
    api.metroUpdate(chain(3, 1000), 1100);
    expect(el.textContent).toBe('♩ waiting for #2 · 3.0s after');
  });
  it('the followed call starts the count; GO at the end', () => {
    const { api, el } = boot();
    api.metroUpdate(chain(2, 1000), 1200);
    expect(el.className).toBe('metro count');
    expect(el.textContent).toBe('♩ #2 called · 2.8s');
    api.metroUpdate(chain(2, 1000), 4100);
    expect(el.className).toBe('metro go');
    expect(el.textContent).toBe('GO');
  });
  it('an old call at load starts nothing', () => {
    const { api, el } = boot();
    api.metroUpdate(chain(2, 1000), 60000);
    expect(el.className).toBe('metro');
    expect(api.M.startAt).toBe(0);
  });
  it('a new call from the same number restarts it', () => {
    const { api } = boot();
    api.metroUpdate(chain(2, 1000), 1100);
    api.metroUpdate(chain(2, 9000), 9100);
    expect(api.M.startAt).toBe(9000);
  });
});

describe('clicks', () => {
  it('one click per second of the count, one high tone at GO', () => {
    const src = stripJs(UPDATE);
    expect(src).toMatch(/if \(p\.sec !== M\.lastSec\) \{ M\.lastSec = p\.sec; metroClick\(880, 60\); \}/);
    expect(src).toMatch(/if \(!M\.went\) \{ M\.went = true; metroClick\(1760, 220\); \}/);
  });
});

describe('the page', () => {
  const js = stripJs(SRC);
  it('⚙ has the switch, after # and wait; the line sits above the rows; render drives it', () => {
    expect(SRC).toMatch(/<input id="metroOn" type="checkbox" \/> Metronome/);
    expect(SRC).toMatch(/<input id="metroAfter" type="number" min="1" max="999"/);
    expect(SRC).toMatch(/<input id="metroWait" type="number" min="0" max="15" step="0\.5"/);
    expect(SRC).toMatch(/<div id="metro" class="metro" style="display:none"><\/div>\s*<div id="rows" class="rows"><\/div>/);
    expect(js).toMatch(/function render\(\)\{\s*metroUpdate\(_last, Date\.now\(\)\);/);
  });
  it('colours from the theme', () => {
    const css = stripCss(SRC);
    expect(css).toMatch(/\.metro\.count\{color:var\(--wp-gold\)/);
    expect(css).toMatch(/\.metro\.go\{color:var\(--wp-bg\);background:var\(--wp-green\)/);
  });
});
