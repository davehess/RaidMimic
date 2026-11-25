// test/ch-chain-cheal.test.js — the guild lead's screenshot of a live chain, 2026-11-25 (names invented):
//   111 CH -- <target> (80%)   ·   222 - CH - <target> - 86%   ·   444 CH - <target> - 72%
//   555 Cheal on --- <target> 35% mana remaining
// "Cheal" (lowercase h) and "on --- Name" did not read before; slot 5 never registered.
//
// Mutation-checked (by hand, 2026-11-25): put _CHW back to CHeal only and "555 Cheal" fails; put _CH_TGT back to "on\s+"
// and it fails too.
//
// Run: npx vitest run test/ch-chain-cheal.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const agent = createRequire(import.meta.url)('../packages/wolfpack-logsync/index.js');
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const z2 = n => String(n).padStart(2, '0');
let NOW = 0;
const stamp = (s) => { const d = new Date(NOW - s * 1000); return `[${DAY[d.getDay()]} ${MON[d.getMonth()]} ${z2(d.getDate())} ${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())} ${d.getFullYear()}]`; };
const raid = (s, who, text) => agent.trackChChainLine(`${stamp(s)} ${who} tells the raid,  '${text}'`);

beforeEach(() => { NOW = Math.floor(Date.now() / 1000) * 1000 + 500; agent._resetChChainForTest(); agent._setAgentPrefsForTest({}); });
afterEach(() => { agent._setAgentPrefsForTest({}); agent._resetChChainForTest(); });

describe('the screenshot chain', () => {
  it('every slot reads, with its mana, and the target', () => {
    raid(20, 'Aldenmar', '555 Cheal on --- Kolossus 35% mana remaining');
    raid(16, 'Brackwyn', '111 CH -- Kolossus (80%)');
    raid(12, 'Corvale', '222 - CH - Kolossus - 86%');
    raid(8, 'Rethlan', '333 - CH - Kolossus - 62%');
    raid(4, 'Nyssara', '444 CH - Kolossus - 72%');
    const snap = agent.chChainSnapshot();
    expect(snap.target).toBe('Kolossus');
    expect(snap.slots[1]).toMatchObject({ name: 'Brackwyn', mana: 80 });
    expect(snap.slots[2]).toMatchObject({ name: 'Corvale', mana: 86 });
    expect(snap.slots[3]).toMatchObject({ name: 'Rethlan', mana: 62 });
    expect(snap.slots[4]).toMatchObject({ name: 'Nyssara', mana: 72 });
    expect(snap.slots[5]).toMatchObject({ name: 'Aldenmar', mana: 35 });
  });
  it('"cheal" in lowercase is still not a call (chat, not a macro)', () => {
    raid(4, 'Aldenmar', '555 cheal on --- Kolossus 35% mana remaining');
    const snap = agent.chChainSnapshot();
    expect(snap && snap.slots && snap.slots[5]).toBeFalsy();
  });
});
