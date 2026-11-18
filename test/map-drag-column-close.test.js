// test/map-drag-column-close.test.js — Map overlay fixes from DECISIONS §628 (the guild lead, 2026-11-17).
//
//  1. A drag must never fit-to-zone. Root cause: while Follow me is on the view is never marked "fitted", so dragging
//     (which switches Follow off) let the next poll's `!S.follow && !S.fitted` branch run fitNow(): the whole zone, mid-drag.
//     Run here for real: boot the page over a fake DOM, drag, poll again, and the view must still be where the drag left it.
//  2/3. The Mini / Full / Spawns / Aggro / Config buttons are a fixed column (#btnCol), in that order, and the movable bar
//     stays right of it.
//  4. Settings open hides the window's ✕; a click on that ✕ within CLOSE_GUARD_MS of settings closing is swallowed.
//
// Text assertions run on comment-stripped source (CLAUDE.md "comments satisfy text assertions"). Mutation-checked by hand:
// delete `S.fitted = true` from the drag branch and "a drag then a poll keeps the view" fails; delete the capture listener
// and "a click on the window ✕ just after settings close is swallowed" fails.
//
// Run: npx vitest run test/map-drag-column-close.test.js

import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, evalBlock, stripJs, stripCss, ROOT } from './_source-slice.js';

const HTML = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));
const SCRIPT_RAW = HTML.slice(HTML.indexOf('<script>') + 8, HTML.lastIndexOf('</script>'));
const STYLE = stripCss(HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>')));
const BODY = HTML.slice(HTML.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '');
const tick = () => new Promise(r => setImmediate(() => setImmediate(r)));

async function boot() {
  const all = {}, docL = {}, timers = [];
  const mkEl = (tag) => {
    const e = { tag, children: [], style: {}, dataset: {}, attrs: {}, listeners: {}, hidden: false, textContent: '', innerHTML: '',
      clientWidth: 600, clientHeight: 400, offsetWidth: 50, offsetHeight: 20, offsetLeft: 0, offsetTop: 0,
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      appendChild(ch) { this.children.push(ch); return ch; }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 }; }, closest() { return null; },
      getContext() { return new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 5 }) : () => {}), set: () => true }); },
    };
    Object.defineProperty(e, 'className', { get() { return this._cn || ''; }, set(v) { this._cn = v; } });
    return e;
  };
  const doc = {
    getElementById(id) { return all[id] || (all[id] = mkEl('#' + id)); },
    createElement: mkEl, hidden: false, body: mkEl('body'), documentElement: { style: { setProperty() {} } },
    addEventListener(t, f, cap) { (docL[t] = docL[t] || []).push({ f, cap: !!cap }); },
  };
  const pts = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 2000, y: 0 }, { id: 3, x: 0, y: 2000 }, { id: 4, x: 2000, y: 2000 }]
    .map(p => Object.assign({ npcs: [{ name: 'a decaying skeleton', level: 10 }], z: 0 }, p));
  const payload = { zone: 'thedeep', long_name: 'The Deep', version: 'v1', status: 'ok', now: 1e12, local_only: false, points: pts,
    zone_id: 164, self: { x: 1000, y: 1000, z: 0, heading: 64, name: 'Aldenmar' }, group: [], raid: [], seen: [], timers: [], unassigned: [] };
  const win = { addEventListener() {}, devicePixelRatio: 1, mimic: undefined };
  const ls = { getItem: () => null, setItem: () => {} };
  const S = new Function('window', 'document', 'location', 'fetch', 'localStorage', 'ResizeObserver', 'setInterval', 'clearInterval',
    SCRIPT_RAW + '\nreturn S;')(win, doc, { search: '' }, () => Promise.resolve({ json: () => Promise.resolve(payload) }),
    ls, undefined, (f) => { timers.push(f); return 1; }, () => {});
  await tick();
  const poll = async () => { timers.forEach(f => { try { f(); } catch (e) { void e; } }); await tick(); };
  const fire = (t, ev) => (docL[t] || []).forEach(l => l.f(ev));
  return { S, all, doc, docL, poll, fire };
}

afterEach(() => vi.restoreAllMocks());

describe('1. a drag never fits the whole zone', () => {
  it('a drag then a poll keeps the view where the drag left it', async () => {
    const { S, all, poll, fire } = await boot();
    expect(S.follow).toBe(true);
    const down = all.stage.listeners.mousedown[0];
    down({ button: 0, clientX: 300, clientY: 200, target: { closest: () => null } });
    fire('mousemove', { clientX: 380, clientY: 250, buttons: 1 });
    fire('mouseup', {});
    expect(S.follow).toBe(false);                     // dragging turns Follow me off, as before
    const { cx, cy, scale } = S.view;
    await poll(); await poll();
    expect(S.view.cx).toBe(cx); expect(S.view.cy).toBe(cy); expect(S.view.scale).toBe(scale);
  });

  it('a wheel zoom while following, then Follow turned off, then a poll keeps the view too', async () => {
    const { S, all, poll } = await boot();
    all.stage.listeners.wheel[0]({ preventDefault() {}, deltaY: -300, clientX: 300, clientY: 200 });
    S.follow = false;
    const { cx, cy, scale } = S.view;
    await poll();
    expect(S.view.cx).toBe(cx); expect(S.view.cy).toBe(cy); expect(S.view.scale).toBe(scale);
  });

  it('a new zone still fits (that is the one automatic fit that stays)', async () => {
    const { S } = await boot();
    S.zone = 'elsewhere'; S.fitted = true;
    expect(sliceBlock(stripJs(SCRIPT_RAW), 'if (p.zone !== S.zone) {', 'zoned = true;')).toMatch(/S\.fitted = false/);
  });
});

describe('2/3. the fixed left button column', () => {
  it('holds Mini, Full, Spawns, Aggro, Config in that order, and the movable bar no longer does', () => {
    const col = sliceBlock(BODY, '<div id="btnCol">', '</div>');
    const ids = [...col.matchAll(/<button[^>]* id="(\w+)"/g)].map(m => m[1]);
    expect(ids).toEqual(['miniBtn', 'modeBtn', 'dotsBtn', 'aggroBtn', 'cfgBtn']);
    const bar = sliceBlock(BODY, '<div id="tools">', '</div>');
    for (const id of ids) expect(bar).not.toContain('id="' + id + '"');
  });
  it('is a vertical flex column at the left edge, under the ✥, and the bar keeps right of it', () => {
    expect(STYLE).toMatch(/#btnCol\{position:absolute;top:30px;left:6px;width:64px;display:flex;flex-direction:column/);
    const { toolBox } = evalBlock(sliceBlock(SCRIPT_RAW, 'var TOOL_LEFT = 74;', '    return edge === \'top\' ? { left: x, top: top0 } : { left: x, top: h - bh - 6 };\n  }'), ['toolBox']);
    for (const edge of ['top', 'left', 'bottom']) expect(toolBox(edge, 0, 100, 20, 800, 600, 6).left).toBeGreaterThanOrEqual(74);
  });
  it('is dropped with the bar in mini mode', () => {
    expect(STYLE).toContain('body.mini:not(.full) #btnCol');
  });
});

describe('4. Config open hides the window ✕; a click just after it closes is ignored', () => {
  it('the window ✕ is hidden while body.cfg-open', () => {
    expect(STYLE).toMatch(/body\.cfg-open #hide-btn\{display:none !important\}/);
  });
  it('closeClickIgnored: only inside the guard window, never before settings ever closed', () => {
    const { closeClickIgnored, CLOSE_GUARD_MS } = evalBlock(sliceBlock(SCRIPT_RAW, 'var CLOSE_GUARD_MS = 600;', '!!closedAt && now - closedAt >= 0 && now - closedAt < CLOSE_GUARD_MS; }'), ['closeClickIgnored', 'CLOSE_GUARD_MS']);
    expect(CLOSE_GUARD_MS).toBe(600);
    expect(closeClickIgnored(1000, 0)).toBe(false);
    expect(closeClickIgnored(1100, 1000)).toBe(true);
    expect(closeClickIgnored(1599, 1000)).toBe(true);
    expect(closeClickIgnored(1600, 1000)).toBe(false);
  });
  it('opening settings sets body.cfg-open, closing clears it, and a click on the ✕ just after is swallowed', async () => {
    const { S, all, doc, fire } = await boot();
    let now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    all.cfgBtn.listeners.click[0]();
    expect(doc.body.classList.contains('cfg-open')).toBe(true);
    all.cfgClose.listeners.click[0]();
    expect(doc.body.classList.contains('cfg-open')).toBe(false);
    const hide = { closest: (sel) => (sel === '#hide-btn' ? hide : null) };
    const swallowed = () => { const ev = { target: hide, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }; fire('click', ev); return ev.stopImmediatePropagation.mock.calls.length > 0; };
    now += 200; expect(swallowed()).toBe(true);
    now += 600; expect(swallowed()).toBe(false);          // a deliberate click later still closes the Map
    expect(S.cfgClosedAt).toBe(1_000_000);
  });
});
