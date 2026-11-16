// test/local-site-same-window.test.js — "On this PC" opens in the dashboard's own window (the guild lead, 2026-11-16:
// "should be able to load in the same window, not external unless people want to launch in a new window").
// Runs the dashboard's real wpOpenLocalSite against a stub page: a plain click navigates in place and leaves the
// "← Dashboard" flag; the ↗ button, Ctrl / Shift / Cmd click and a middle click go to Mimic's own window; a right
// click does nothing. Run: npx vitest run test/local-site-same-window.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sliceBlock, stripJs } from './_source-slice.js';

const dash = fs.readFileSync(path.join(ROOT, 'packages/wolfpack-logsync/dashboard.html'), 'utf8');
const src = sliceBlock(dash, 'function wpOpenLocalSite(page, how) {', '\n  fallback();\n}');

function world() {
  const w = { href: null, opened: [], mimic: [], flag: null };
  const fn = new Function('location', 'sessionStorage', 'window', src + '\nreturn wpOpenLocalSite;')(
    { set href(v) { w.href = v; } },
    { setItem: (k, v) => { w.flag = [k, v]; } },
    { open: (u) => w.opened.push(u), mimic: { openLocalSite: (p) => { w.mimic.push(p); return true; } } },
  );
  return { w, open: fn };
}
const click = (o = {}) => ({ type: 'click', button: 0, preventDefault() {}, ...o });

describe('wpOpenLocalSite', () => {
  it('a plain click opens the page in this window and leaves the way back', () => {
    const { w, open } = world();
    open('flags', click());
    expect(w.href).toBe('/local/flags/');
    expect(w.flag).toEqual(['wpLocalFromDash', '1']);
    expect(w.mimic).toEqual([]);
  });

  it('the ↗ button, Ctrl / Shift / Cmd click and a middle click open its own window', () => {
    for (const how of ['window', click({ ctrlKey: true }), click({ shiftKey: true }), click({ metaKey: true }), click({ type: 'auxclick', button: 1 })]) {
      const { w, open } = world();
      open('inventory', how);
      expect(w.href, JSON.stringify(how)).toBeNull();
      expect(w.mimic).toEqual(['inventory']);
    }
  });

  it('a right click (auxclick, button 2) does nothing', () => {
    const { w, open } = world();
    open('replay', click({ type: 'auxclick', button: 2 }));
    expect(w.href).toBeNull();
    expect(w.mimic).toEqual([]);
  });

  it('every rail item has a same-window click and a ↗ own-window button; the local nav offers the way back', () => {
    for (const p of ['inventory', 'flags', 'parses', 'replay']) {
      expect(dash).toContain(`onclick="wpOpenLocalSite('${p}', event)"`);
      expect(dash).toContain(`onclick="wpOpenLocalSite('${p}', 'window')"`);
    }
    const nav = stripJs(fs.readFileSync(path.join(ROOT, 'web/local/app/LocalNav.tsx'), 'utf8'));
    expect(nav).toContain("sessionStorage.getItem('wpLocalFromDash') === '1'");
    expect(nav).toMatch(/<a href="\/"[^>]*>← Dashboard<\/a>/);
  });
});
