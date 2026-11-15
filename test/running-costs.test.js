// test/running-costs.test.js — https://raidmimic.com/costs, "What Raid Mimic costs to run" (the guild lead, 2026-11-15,
// DECISIONS §588). Pins: the page exists and reads its figures from web/lib/runningCosts.ts; its metadata is in the page
// and in pageMeta.ts; it is an open path on a raidmimic host; every figure names its source; the Ko-fi link is exact.
//
// Run: npx vitest run test/running-costs.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import { metaForPath } from '../web/lib/pageMeta.ts';
import { isRaidmimicOpenPath } from '../web/lib/raidmimicHost.ts';
import * as C from '../web/lib/runningCosts.ts';

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the costs page', () => {
  const page = read('web', 'app', 'costs', 'page.tsx');
  const code = stripJs(page);

  it('exists, reads the data module and is marked [beta]', () => {
    expect(code).toMatch(/from '@\/lib\/runningCosts'/);
    expect(code).toMatch(/\[beta\]/);
    expect(code).toMatch(/measuredAt/);
  });

  it('has a title and description in its own metadata and in pageMeta.ts', () => {
    expect(code).toMatch(/export function generateMetadata/);
    expect(code).toMatch(/description: DESCRIPTION/);
    const m = metaForPath('/costs');
    expect(m.title).toContain('What Raid Mimic costs to run');
    expect(m.description.length).toBeGreaterThan(20);
    expect(m.title).not.toBe(metaForPath('/').title);
  });

  it('is an open path on a raidmimic host', () => {
    expect(isRaidmimicOpenPath('/costs')).toBe(true);
    expect(isRaidmimicOpenPath('/costs/x')).toBe(false);
  });

  it('is linked from the raidmimic footer', () => {
    expect(stripJs(read('web', 'app', 'raidmimic', '_landing', 'Parts.tsx'))).toMatch(/href="\/costs"/);
  });

  it('links Ko-fi exactly and opens it with rel noopener', () => {
    expect(C.KOFI_URL).toBe('https://ko-fi.com/davehess');
    expect(code).toMatch(/href=\{KOFI_URL\}[^>]*rel="noopener"/);
  });
});

describe('runningCosts.ts', () => {
  it('has a measuredAt date', () => {
    expect(C.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('every figure has a source note', () => {
    expect(C.allFigures.length).toBeGreaterThanOrEqual(10);
    for (const f of C.allFigures) expect(f.source, f.key).toMatch(/\S{3}/);
    for (const l of C.bill) expect(l.source, l.key).toMatch(/\S{3}/);
  });

  it('an unmeasured line is null, never a guess, and the total counts only what is known', () => {
    expect(C.bill.every((l) => l.monthly === null || (Number.isFinite(l.monthly) && l.monthly >= 0))).toBe(true);
    expect(C.knownMonthly).toBe(C.bill.reduce((s, l) => s + (l.monthly ?? 0), 0));
  });

  it('the replay parts add up to about the replay figure', () => {
    const sum = C.replayParts.reduce((s, p) => s + (p.mb ?? 0), 0);
    expect(Math.abs(sum - C.replaySize.mb)).toBeLessThanOrEqual(5);
  });
});
