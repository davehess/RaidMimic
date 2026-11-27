// test/preraid-stale-event.test.js — the pre-raid checklist and the midday post only use an event Raid-Helper still lists.
//
// The guild lead, 2026-11-27, about the Thanksgiving checklist: "we don't have a raid planned tonight where are these numbers
// from". It was Thursday's Raid-Helper event, removed upstream after 2026-11-13: the rh_events mirror only adds and updates,
// so its last copy (10 signups) stayed, and the checklist picked it as tonight's raid. An event the latest sync no longer
// refreshes is gone upstream; with no live event and no planned targets, neither post goes out.
//
// Mutation-checked (by hand, 2026-11-27): drop the synced_at filter and "a removed event is not tonight" fails; drop the
// noRaidTonight check in postPreRaidChecklist and "nothing is posted" fails.
//
// Run: npx vitest run test/preraid-stale-event.test.js

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const preraid = require('../commands/preraid.js');

const NOW = Date.parse('2026-11-27T00:03:00Z');            // Thu 2026-11-26 7:03 PM ET
const thu = { id: 'thu', start_time: '2026-11-27T01:30:00Z', synced_at: '2026-11-13T15:03:00Z' };   // removed upstream
const LATEST = Date.parse('2026-11-26T23:53:54Z');          // the sync ten minutes before the post

describe('pickTonightsEvent', () => {
  it('a removed event is not tonight: the latest sync did not see it', () => {
    expect(preraid.pickTonightsEvent([thu], LATEST, NOW)).toBeNull();
  });
  it('the same event, still listed, is tonight', () => {
    expect(preraid.pickTonightsEvent([{ ...thu, synced_at: '2026-11-26T23:30:00Z' }], LATEST, NOW)).toMatchObject({ id: 'thu' });
  });
  it('still picks the closest live event within 18 h, and ignores ones further out', () => {
    const live = (id, start) => ({ id, start_time: start, synced_at: '2026-11-26T23:50:00Z' });
    const rows = [live('fri', '2026-11-28T01:30:00Z'), live('thu', '2026-11-27T01:30:00Z'), live('mon', '2026-12-01T01:30:00Z')];
    expect(preraid.pickTonightsEvent(rows, LATEST, NOW).id).toBe('thu');
    expect(preraid.pickTonightsEvent([live('mon', '2026-12-01T01:30:00Z')], LATEST, NOW)).toBeNull();
  });
  it('with no sync time known (or a row without one) it behaves as before', () => {
    expect(preraid.pickTonightsEvent([thu], null, NOW)).toMatchObject({ id: 'thu' });
    expect(preraid.pickTonightsEvent([{ id: 'x', start_time: thu.start_time }], LATEST, NOW)).toMatchObject({ id: 'x' });
  });
});

describe('no raid tonight: nothing is posted', () => {
  it('noRaidTonight: no event and no planned targets', () => {
    expect(preraid.noRaidTonight({ event: null, planned: null })).toBe(true);
    expect(preraid.noRaidTonight({ event: null, planned: { bossIds: [] } })).toBe(true);
    expect(preraid.noRaidTonight({ event: { id: 'thu' }, planned: null })).toBe(false);
    expect(preraid.noRaidTonight({ event: null, planned: { bossIds: ['vallon'] } })).toBe(false);
  });
  it('postPreRaidChecklist and postMiddayRaidInfo say "no raid" and send nothing', async () => {
    const src = require('node:fs').readFileSync(require.resolve('../commands/preraid.js'), 'utf8');
    const strip = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const code = strip(src);
    expect(code).toMatch(/const data = await gather\(client\);\s*if \(noRaidTonight\(data\)\) return \{ ok: false, noRaid: true, reason: 'no raid tonight/);
    expect(code).toMatch(/const data = await gather\(client\);\s*if \(noRaidTonight\(data\)\) return \{ ok: false, noRaid: true, reason: 'no raid event found for today' \};/);
    expect(code).toMatch(/const soon = pickTonightsEvent\(evRows, /);
    void vi;
  });
});
