// test/charm-named-pet-hold.test.js — a charmed NAMED mob stays charmed while Zeal shows it as the pet.
//
// FB-121 (2026-11-06): an enchanter charmed Giwin Mirakon with Allure; the tracker called a charm break
// and then showed "no active charm" while the pet window still held him. A pet with no "a/an/the" only
// counts as a charm while a charm cast is pending, and landing consumes that cast, so the next
// reconcile pass dropped the pet from the live set and the 6s gauge rule called a break.
// Runs the real agent. The owner's name is invented; the pet is the mob from the report.
//
// Run: npx vitest run test/charm-named-pet-hold.test.js

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

let agent;
beforeAll(() => { agent = createRequire(import.meta.url)('../packages/wolfpack-logsync/index.js'); });

const OWNER = 'Rethlan';
const PET = 'Giwin Mirakon';
const T0 = new Date(2026, 10, 6, 13, 46, 49).getTime();   // the cast line's local time

function at(sec, gaugePet) {
  vi.setSystemTime(T0 + sec * 1000);
  agent._setZealStateForTest(OWNER, { gauges: gaugePet ? [{ slot: 16, text: gaugePet }] : [{ slot: 6, text: 'a Diaku Scout' }], charInfo: [{ id: 3, value: 'Enchanter' }] });
  agent._reconcileGaugeCharms();
  return agent._charmTickTracker.get(PET.toLowerCase());
}

afterEach(() => {
  agent._setZealStateForTest(OWNER, null);
  agent._charmTickTracker.delete(PET.toLowerCase());
  vi.useRealTimers();
});

describe('a charmed named mob', () => {
  function charm() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    agent.noteSelfCast('[Fri Nov 06 13:46:49 2026] You begin casting Allure.', OWNER);
    at(3, PET);
    return at(5, PET);
  }

  it('opens on the gauge after the cast', () => {
    const c = charm();
    expect(c && c.is_active).toBe(true);
    expect(c.owner).toBe(OWNER);
  });

  it('stays charmed while Zeal keeps showing it as the pet', () => {
    charm();
    for (const sec of [8, 12, 20, 40, 90]) {
      const c = at(sec, PET);
      expect(c && c.is_active, `still charmed at +${sec}s`).toBe(true);
    }
  });

  // The guild lead, 2026-11-17: "Diaku Armsman" charmed, the tracker then read "no active charm" while the pet window still
  // showed him. A named mob comes in sets, so a "slain" line (or a Zeal death by spawn id) for ANOTHER of the same name
  // deleted ours, and a named pet had no way back in without a fresh cast.
  const fresh = (gaugePet) => agent._setZealStateForTest(OWNER, { updatedAt: Date.now(), gauges: [{ slot: 16, text: gaugePet }], charInfo: [{ id: 3, value: 'Enchanter' }] });

  it('a same-named mob slain elsewhere does not end the charm while the pet window still shows ours', () => {
    charm();
    vi.setSystemTime(T0 + 30_000);
    fresh(PET);
    expect(agent.checkCharmPetDeath(`[Fri Nov 06 13:47:19 2026] ${PET} has been slain by a Diaku Overseer!`, OWNER)).toBe(false);
    const c = at(35, PET);
    expect(c && c.is_active).toBe(true);
  });

  it('a Zeal death for that spawn id does not end it either while slot 16 still names the pet', () => {
    const c0 = charm();
    c0.pet_id = 4321;
    vi.setSystemTime(T0 + 30_000);
    fresh(PET);
    expect(agent._charmPetDiedById(4321)).toEqual([]);
    expect(at(35, PET).is_active).toBe(true);
  });

  it('if it really was our pet, it leaves the pet window and goes quietly, with no charm-break call', () => {
    charm();
    vi.setSystemTime(T0 + 30_000);
    fresh(PET);
    agent.checkCharmPetDeath(`[Fri Nov 06 13:47:19 2026] ${PET} has been slain by a Diaku Overseer!`, OWNER);
    at(31, null);
    at(38, null);
    expect(agent._charmTickTracker.has(PET.toLowerCase())).toBe(false);   // deleted, not a lingering BROKE card
  });

  it('a named pet dropped from the tracker is re-adopted from the pet window within 15 minutes', () => {
    charm();
    at(10, PET);                                       // seen active: remembered for this owner
    agent._charmTickTracker.delete(PET.toLowerCase()); // dropped (the old same-name "slain" path)
    at(20, PET);
    const c = at(23, PET);                              // two frames past the debounce
    expect(c && c.is_active).toBe(true);
    agent._lastCharmPetByOwner.clear();
  });

  it('still breaks when the pet leaves the gauge', () => {
    charm();
    at(10, PET);
    at(12, null);
    const c = at(17, null);
    expect(c && c.is_active).toBe(false);
  });
});
