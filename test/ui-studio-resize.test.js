// test/ui-studio-resize.test.js — UI Studio: resize a window by dragging any edge or corner.
//
// The guild lead, 2026-11-25: "it would be cool to resize UI in UI studio by drag/pull". The editor had one grip, bottom
// right, shown only once a window was selected. Every resizable window now carries all eight, shown on hover.
//
// 1. apps/mimic/uiFit.js resizeRect (pure, run as shipped): each edge and corner moves only its own sides, the far edge
//    stays put, never under the minimum, never off the screen.
// 2. ui-studio.html: the eight grips on every window that is not fixed-size, shown on hover or selection; the drag uses
//    resizeRect for every resize-* mode and pins the size (sizeEdited) so Save writes it.
//
// Mutation-checked (by hand, 2026-11-25): let the west edge keep x and "west moves x and keeps the right edge" fails; drop
// the screen clamp on the east edge and "stops at the screen edge" fails.
//
// Run: npx vitest run test/ui-studio-resize.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readSource, sliceBlock, stripJs, stripCss, ROOT } from './_source-slice.js';

const require = createRequire(import.meta.url);
const UiFit = require(path.join(ROOT, 'apps', 'mimic', 'uiFit.js'));
const STUDIO = readSource(path.join(ROOT, 'apps', 'mimic', 'ui-studio.html'));

const R = { x: 100, y: 100, w: 200, h: 100 };
const rr = (dir, dx, dy) => UiFit.resizeRect(R, dir, dx, dy, 16, 1920, 1080);

describe('resizeRect', () => {
  it('the eight directions', () => {
    expect(UiFit.RESIZE_DIRS.slice().sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
  });
  it('east and south change only the size', () => {
    expect(rr('e', 50, 999)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(rr('s', 999, 30)).toEqual({ x: 100, y: 100, w: 200, h: 130 });
    expect(rr('se', 50, 30)).toEqual({ x: 100, y: 100, w: 250, h: 130 });
  });
  it('west moves x and keeps the right edge; north moves y and keeps the bottom', () => {
    expect(rr('w', -40, 0)).toEqual({ x: 60, y: 100, w: 240, h: 100 });
    expect(rr('n', 0, 20)).toEqual({ x: 100, y: 120, w: 200, h: 80 });
    expect(rr('nw', 30, -30)).toEqual({ x: 130, y: 70, w: 170, h: 130 });
    expect(rr('ne', 10, 10)).toEqual({ x: 100, y: 110, w: 210, h: 90 });
    expect(rr('sw', -10, 10)).toEqual({ x: 90, y: 100, w: 210, h: 110 });
  });
  it('never under the minimum, whichever edge', () => {
    expect(rr('e', -500, 0).w).toBe(16);
    expect(rr('w', 500, 0)).toEqual({ x: 284, y: 100, w: 16, h: 100 });
    expect(rr('n', 0, 500)).toEqual({ x: 100, y: 184, w: 200, h: 16 });
  });
  it('stops at the screen edge, on every side', () => {
    expect(rr('e', 5000, 0).w).toBe(1920 - 100);
    expect(rr('s', 0, 5000).h).toBe(1080 - 100);
    expect(rr('w', -5000, 0)).toEqual({ x: 0, y: 100, w: 300, h: 100 });
    expect(rr('n', 0, -5000)).toEqual({ x: 100, y: 0, w: 200, h: 200 });
  });
});

describe('ui-studio.html', () => {
  const code = stripJs(STUDIO);
  it('every window that is not fixed-size carries the eight grips', () => {
    expect(code).toContain("(!w.fixedSize ? UiFit.RESIZE_DIRS.map(function (d) { return '<div class=\"grip ' + d + '\" data-grip=\"' + d + '\"></div>'; }).join('') : '')");
  });
  it('they show on hover or selection, with the right cursors', () => {
    const css = stripCss(STUDIO);
    expect(css).toMatch(/\.win \.grip\{display:none\}/);
    expect(css).toMatch(/\.win:hover \.grip,\.win\.selected \.grip\{display:block\}/);
    expect(css).toMatch(/\.win \.grip\.n\{top:-3px;cursor:ns-resize\}/);
    expect(css).toMatch(/\.win \.grip\.w\{left:-3px;cursor:ew-resize\}/);
    expect(css).toMatch(/\.win \.grip\.nw\{left:-4px;top:-4px;cursor:nwse-resize\}/);
  });
  it('every resize-* drag goes through resizeRect and pins the size', () => {
    const move = sliceBlock(code, "document.addEventListener('mousemove', function(e){", 'renderStage();');
    expect(move).toMatch(/\} else if \(DRAG\.mode\.indexOf\('resize-'\) === 0\) \{/);
    expect(move).toMatch(/UiFit\.resizeRect\(\{ x: DRAG\.origX, y: DRAG\.origY, w: DRAG\.origW, h: DRAG\.origH \}, DRAG\.mode\.slice\(7\), dx, dy, 16, STATE\.tgtW, STATE\.tgtH\)/);
    expect(move).toMatch(/w\.sizeEdited = true;/);
  });
});
