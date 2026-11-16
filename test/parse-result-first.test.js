// test/parse-result-first.test.js — the parse page's default layout (picked from the design lab, 2026-11-15): the pure
// mapper that feeds it, the one-line headlines, the panel wording, and the page wiring (?v=old keeps the old layout).
// Run: npx vitest run test/parse-result-first.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import { toResultView, headlines, classShare, fmtClock, viewerRole } from '../web/lib/parseResultFirstView.ts';

const base = { boss: 'Boss', zone: 'Zone', whenLabel: 'now', isWipe: false, classification: null, endedAt: '2026-11-11T01:01:40Z', startedAt: '2026-11-11T01:00:00Z',
  durationSec: 100, totalDamage: 1000, totalDps: 10, players: [], classOf: () => null, deaths: [], contribs: [], events: [], loot: [] };

describe('toResultView', () => {
  it('ranks, computes shares and offsets death times from the start', () => {
    const v = toResultView({ ...base, players: [
      { character_name: 'B', total_damage: 300, dps: 3 }, { character_name: 'A', total_damage: 700, dps: 7 }],
    classOf: (n) => (n === 'A' ? 'Rogue' : null), deaths: [{ name: 'B', ts: '2026-11-11T01:00:42Z' }], mine: ['b'] });
    expect(v.players.map((p) => [p.rank, p.name, Math.round(p.pct)])).toEqual([[1, 'A', 70], [2, 'B', 30]]);
    expect(v.deaths[0].atSec).toBe(42);
    expect(headlines.deaths(v)).toBe('1 death, first at 0:42');
  });
  it('no players: empty view, no crash, zero share', () => {
    const v = toResultView({ ...base, totalDamage: null, totalDps: null });
    expect(v.players).toEqual([]);
    expect(v.totalDamage).toBe(0);
    expect(v.role).toBe('damage');
    expect(headlines.deaths(v)).toBe('No deaths');
    expect(classShare(v.players)).toEqual([]);
  });
  it('null duration stays null and the raid DPS falls back to the stored number', () => {
    const v = toResultView({ ...base, durationSec: null, totalDps: 55 });
    expect(v.durationSec).toBeNull();
    expect(v.raidDps).toBe(55);
    expect(fmtClock(v.durationSec)).toBe('-');
  });
  it('a wipe, an unclassified-but-not-wipe fight and an unconfirmed fight keep their own state word', () => {
    expect(toResultView({ ...base, isWipe: true }).state).toBe('wipe');
    expect(toResultView({ ...base, classification: 'test' }).state).toBe('unknown');
    expect(toResultView(base).state).toBe('killed');
    expect(toResultView({ ...base, endedAt: null }).state).toBe('open');
  });
  it('a viewer with no rows gets no marks and the damage role', () => {
    const v = toResultView({ ...base, players: [{ character_name: 'A', total_damage: 5, dps: 1 }], mine: ['Nobody'] });
    expect(viewerRole(v.mine, v.players)).toBe('damage');
    expect(v.players).toHaveLength(1);
  });
  it('tank and heal summaries keep each name once at its best number', () => {
    const rp = (n) => ({ defenders: [{ name: 'Tk', damageTaken: n, hits: 2, dodges: 1 }], healers: [{ name: 'Hl', healed: n, ticks: 3 }] });
    const v = toResultView({ ...base, players: [{ character_name: 'Tk', total_damage: 1, dps: 1 }, { character_name: 'Hl', total_damage: 1, dps: 1 }], contribs: [
      { contributor_character: 'x', total_damage: 1, raw_parse: rp(100) }, { contributor_character: 'y', total_damage: 1, raw_parse: rp(500) },
      { contributor_character: null, total_damage: 1, raw_parse: null }] });
    expect(v.tanks).toEqual([{ name: 'Tk', hits: 2, taken: 500, avoided: 1 }]);
    expect(v.healers).toHaveLength(1);
    expect(v.healers[0].healed).toBe(500);
    expect(v.contributors[2].name).toBe('(anonymous)');
  });
});

describe('review fixes', () => {
  it('the tank list drops the boss and adds: only this fight\'s player rows count', () => {
    const v = toResultView({ ...base, players: [{ character_name: 'Aldenmar', total_damage: 5, dps: 1 }], contribs: [
      { contributor_character: 'x', total_damage: 1, raw_parse: { defenders: [
        { name: 'Cazic Thule', damageTaken: 9000, hits: 9 }, { name: 'aldenmar', damageTaken: 400, hits: 4 }] } }] });
    expect(v.tanks.map((t) => t.name)).toEqual(['aldenmar']);
  });
  it('detailKept is false only when no contribution still has its detailed log', () => {
    expect(toResultView({ ...base, contribs: [{ contributor_character: 'x', total_damage: 1, raw_parse: null }] }).detailKept).toBe(false);
    expect(toResultView({ ...base, contribs: [{ contributor_character: 'x', total_damage: 1, raw_parse: { defenders: [] } }] }).detailKept).toBe(true);
  });
  const shared = stripJs(fs.readFileSync(path.join(ROOT, 'web/components/parse-result/shared.tsx'), 'utf8'));
  it('the panels say the detail is gone, never "Nobody died", when it is', () => {
    expect(shared).toMatch(/if \(!v\.detailKept\) return <Empty>\{OLD\}<\/Empty>;\s+if \(!v\.deaths\.length\)/);
    expect(shared).toContain('Detail is kept for 7 days. This fight is older.');
    expect(shared).toContain('No kill seen');
  });
});

describe('the page', () => {
  const src = stripJs(fs.readFileSync(path.join(ROOT, 'web/app/parses/[id]/page.tsx'), 'utf8'));
  it('reads ended_at, and the new layout is the default with the old one behind ?v=old', () => {
    expect(src).toMatch(/id, started_at, ended_at, duration_sec/);
    expect(src).toMatch(/endedAt: enc\.ended_at/);
    expect(src).toMatch(/if \(view !== 'old'\)/);
    expect(src.indexOf("view !== 'old'")).toBeLessThan(src.indexOf('Damage breakdown'));
    expect(src).toMatch(/view === 'old' \? encodeURIComponent\(`\/parses\/\$\{id\}\?v=old`\)/);
  });
  it('marks the viewer\'s own rows through wolfpack_members -> discord_id -> characters, and keeps the officer controls on both layouts', () => {
    expect(src).toMatch(/from\('wolfpack_members'\)\.select\('discord_id'\)\.eq\('user_id', user\.id\)/);
    expect(src).toMatch(/from\('characters'\)\.select\('name'\)\.eq\('guild_id', GUILD_TAG\)\.eq\('discord_id'/);
    expect((src.match(/\{officerAdmin\}/g) ?? []).length).toBe(2);
    expect(src).toMatch(/\{officerAdmin && /);
  });
  it('the Deaths panel is a tab with its count, not an open section', () => {
    const tabs = stripJs(fs.readFileSync(path.join(ROOT, 'web/components/parse-result/TabbedResult.tsx'), 'utf8'));
    expect(tabs).toMatch(/useState<PanelKey>\('damage'\)/);
    expect(tabs).toMatch(/t\.key === 'deaths' && n > 0 \? 'text-red'/);
  });
});
