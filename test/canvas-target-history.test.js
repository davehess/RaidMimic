// test/canvas-target-history.test.js — the whole Target Info panel on the Timers canvas keeps the ◀ ▶ pager and
// the ⟲ Recent tab (the guild lead, 2026-11-19: "the target info in canvas is missing the scroll back through
// previous targets/kills"). The canvas CSS hid both for every copy of the page; only a piece cut from the page
// (?wpsect=) should lack them.
//
// Run: npx vitest run test/canvas-target-history.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, stripCss, stripJs } from './_source-slice.js';

const html = readSource(path.join(__dirname, '..', 'apps', 'mimic', 'mobinfo.html'));
const css = stripCss(html.slice(html.indexOf('<style'), html.indexOf('</style>')));
const js = stripJs(html.slice(html.indexOf('<script src="targetInfoShared.js">')));

describe('Target Info history on the canvas', () => {
  it('the canvas no longer hides the pager', () => {
    expect(css).not.toMatch(/wp-in-canvas\s+\.pager\s*,/);
    expect(css).not.toMatch(/wp-in-canvas[^{}]*\.pager[^{}]*\{[^}]*display:\s*none/);
  });
  it('only a cut-out piece loses the Recent tab, and is marked so', () => {
    expect(css).toMatch(/wp-in-canvas\.wp-piece #tabRecent\{display:none/);
    expect(css).not.toMatch(/body\.wp-in-canvas #tabRecent/);
    expect(js).toMatch(/if \(_pgOff\) document\.body\.classList\.add\('wp-piece'\)/);
  });
  it('the pager controls are buttons on the hover handshake', () => {
    for (const id of ['pgPrev', 'pgNext', 'pgFilter', 'pgLive']) {
      expect(html).toMatch(new RegExp('<button id="' + id + '"'));
    }
    expect(js).toMatch(/\[pgPrevBtn, pgNextBtn, pgFilterBtn, pgLiveBtn, tabRecentBtn\]\.forEach/);
    expect(js).toMatch(/overlayHoverInteractive\(true\)/);
  });
});
