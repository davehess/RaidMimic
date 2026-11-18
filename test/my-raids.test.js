// test/my-raids.test.js — "My raids" on raidmimic.com (the guild lead, 2026-11-15: "upcoming raids with targets needed,
// calendar view, set your own guilds raiding days, select your own characters guilds from drop-down").
//
// Behaviour first: the pure lib (web/lib/myRaids.ts) and the player-scoped writes (web/lib/myRaidsWrite.ts) run for real, the
// writes over a stub database. Text checks (comments stripped) pin only what cannot be run: the migration's shape, the route
// being open on a raidmimic host, the nav, the page's metadata entry and the export. Characters named here are invented.
import { describe, it, expect } from 'vitest';
import { ROOT, readSource, stripJs, stripSql } from './_source-slice.js';
import path from 'node:path';
import {
  upcomingRaids, scheduleFor, buildMyRaids, cleanLabel, validateEntry, dateKeyIn, monthCells, parseMonth, shiftMonth,
  MAX_GUILD_ENTRIES, targetKeyOf,
} from '../web/lib/myRaids.ts';
import { saveEntry, removeEntry, setTarget, linkCharacter, linkCharacters } from '../web/lib/myRaidsWrite.ts';
import { FLAG_TARGETS } from '../web/lib/flagTargets.ts';
import { isRaidmimicOpenPath } from '../web/lib/raidmimicHost.ts';
import { metaForPath } from '../web/lib/pageMeta.ts';
import { SELF_TABLES } from '../web/lib/selfData.ts';

const src = (rel) => readSource(path.join(ROOT, rel));
const ny = (sched = {}) => ({ tz: 'America/New_York', days: [0], start: '20:30', end: '23:30', planEnd: '23:30', nightCutoffHour: 6, ...sched });

// A Saryrn kill-and-hail is held ('saryrn_1'); a character with nothing, read in full, still needs it; a kill on record with
// no hail after it is "not sure" (popGateStatus.ts: killOnly reads as unknown).
const READY = ['saryrn_1'];
const MISSING = [];
const KILL_ONLY = ['saryrn_dead'];

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const ENTRY = (over = {}) => ({ id: E1, guildId: null, guildName: 'Breakfast Club', days: [0], startHhmm: '20:30', durationMin: 180, tz: 'America/New_York', useGuildSchedule: true, ...over });
const BASE = (over = {}) => ({ entries: [ENTRY()], guildSchedules: {}, targetsByEntryDate: {}, publishedTargets: [], characters: [], ...over });

describe('upcomingRaids', () => {
  it('keeps the wall-clock start across the spring DST change (UTC gap 23h, local time unchanged)', () => {
    const now = Date.UTC(2026, 2, 5, 12);   // Thu Mar 5 2026
    const w = upcomingRaids(ny({ days: [6, 0] }), now, 7);
    const sat = w.find(x => dateKeyIn(x.startMs, 'America/New_York') === '2026-03-07');
    const sun = w.find(x => dateKeyIn(x.startMs, 'America/New_York') === '2026-03-08');
    expect(sat.startMs).toBe(Date.UTC(2026, 2, 8, 1, 30));   // 20:30 EST
    expect(sun.startMs).toBe(Date.UTC(2026, 2, 9, 0, 30));   // 20:30 EDT
    expect(sun.startMs - sat.startMs).toBe(23 * 3_600_000);
  });

  it('lists a raid that crossed midnight while it is still on, and drops it once it ends', () => {
    const sched = ny({ start: '22:00', end: '02:00', planEnd: '02:00' });
    const during = Date.UTC(2026, 2, 9, 5, 0);   // Mon 01:00 EDT, Sunday's raid is on
    const after = Date.UTC(2026, 2, 9, 7, 0);    // Mon 03:00 EDT, over
    expect(upcomingRaids(sched, during, 1).map(w => w.startMs)).toContain(Date.UTC(2026, 2, 9, 2, 0));
    expect(upcomingRaids(sched, after, 1).map(w => w.startMs)).not.toContain(Date.UTC(2026, 2, 9, 2, 0));
  });

  it('is empty for no days, and only looks `days` ahead', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    expect(upcomingRaids(ny({ days: [] }), now)).toEqual([]);
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(upcomingRaids(ny({ days: all }), now, 3).length).toBeLessThanOrEqual(4);
    expect(upcomingRaids(ny({ days: all }), now, 14).length).toBeGreaterThan(10);
  });
});

describe('scheduleFor', () => {
  const guildRow = { v: 1, schedule: { tz: 'America/Chicago', days: [2, 4], start: '19:00', end: '22:00', planEnd: '22:00', nightCutoffHour: 6 } };

  it('inherits a registered guild\'s schedule when the entry follows it', () => {
    const s = scheduleFor(ENTRY({ guildId: 'breakfast-club', days: [0] }), guildRow);
    expect(s.tz).toBe('America/Chicago');
    expect(s.days).toEqual([2, 4]);
    expect(s.start).toBe('19:00');
  });
  it('uses the player\'s own days when it does not follow, when the guild has no days, or when the guild has no row', () => {
    expect(scheduleFor(ENTRY({ guildId: 'breakfast-club', useGuildSchedule: false }), guildRow).days).toEqual([0]);
    expect(scheduleFor(ENTRY({ guildId: 'breakfast-club' }), { v: 1, schedule: { days: [] } }).days).toEqual([0]);
    expect(scheduleFor(ENTRY({ guildId: 'breakfast-club' }), null).days).toEqual([0]);
  });
  it('builds the end from the start and the length, across midnight', () => {
    const s = scheduleFor(ENTRY({ startHhmm: '22:30', durationMin: 240 }), null);
    expect(s.start).toBe('22:30');
    expect(s.end).toBe('02:30');
  });
  it('is null without a day, a start or a known zone', () => {
    expect(scheduleFor(ENTRY({ days: [] }), null)).toBeNull();
    expect(scheduleFor(ENTRY({ startHhmm: null }), null)).toBeNull();
    expect(scheduleFor(ENTRY({ tz: 'Mars/Olympus' }), null)).toBeNull();
    expect(scheduleFor(ENTRY({ days: [9] }), null)).toBeNull();
  });
});

describe('buildMyRaids', () => {
  const NOW = Date.UTC(2026, 10, 15, 12);   // Sun Nov 15 2026, 07:00 EST
  const sundayKey = '2026-11-15';

  it('a target the guild posted wins over one the player set, and says where it came from', () => {
    const input = BASE({
      entries: [ENTRY({ guildId: 'breakfast-club' })],
      guildSchedules: { 'breakfast-club': { v: 1, schedule: ny({ days: [0] }) } },
      targetsByEntryDate: { [targetKeyOf(E1, sundayKey)]: 'marr' },
      publishedTargets: [{ guildId: 'breakfast-club', startsMs: Date.UTC(2026, 10, 16, 1, 30), targetKey: 'saryrn' }],   // Sun 20:30 EST
    });
    const r = buildMyRaids(input, NOW).find(x => x.dateKey === sundayKey);
    expect(r.targetKey).toBe('saryrn');
    expect(r.targetSource).toBe('guild');
    const mine = buildMyRaids({ ...input, publishedTargets: [] }, NOW).find(x => x.dateKey === sundayKey);
    expect(mine.targetKey).toBe('marr');
    expect(mine.targetSource).toBe('mine');
  });

  it('ignores a target key the catalog does not have, and a guild\'s post for a different guild', () => {
    const r = buildMyRaids(BASE({
      targetsByEntryDate: { [targetKeyOf(E1, sundayKey)]: 'not-a-target' },
      publishedTargets: [{ guildId: 'other-guild', startsMs: Date.UTC(2026, 10, 16, 1, 30), targetKey: 'saryrn' }],
    }), NOW).find(x => x.dateKey === sundayKey);
    expect(r.targetKey).toBeNull();
    expect(r.targetSource).toBeNull();
    expect(r.perCharacter).toEqual([]);
  });

  it('answers ready / needs / not sure per character from the real gate rule', () => {
    const r = buildMyRaids(BASE({
      targetsByEntryDate: { [targetKeyOf(E1, sundayKey)]: 'saryrn' },
      characters: [
        { name: 'Aldenmar', flags: READY, playerGuildId: null },
        { name: 'Brackwyn', flags: MISSING, playerGuildId: null },
        { name: 'Corvale', flags: KILL_ONLY, playerGuildId: null },
      ],
    }), NOW).find(x => x.dateKey === sundayKey);
    const by = Object.fromEntries(r.perCharacter.map(c => [c.name, c]));
    expect(by.Aldenmar.verdict).toBe('done');
    expect(by.Aldenmar.needs).toEqual([]);
    expect(by.Brackwyn.verdict).toBe('need');
    expect(by.Brackwyn.needs).toEqual(["Saryrn's half"]);
    expect(by.Corvale.verdict).toBe('unsure');
  });

  it('the target catalog is the real one: every key sets a target and gives every character a verdict', () => {
    for (const t of FLAG_TARGETS) {
      const r = buildMyRaids(BASE({
        targetsByEntryDate: { [targetKeyOf(E1, sundayKey)]: t.key },
        characters: [{ name: 'Aldenmar', flags: [], playerGuildId: null }],
      }), NOW).find(x => x.dateKey === sundayKey);
      expect(r.targetKey, t.key).toBe(t.key);
      expect(['need', 'unsure', 'done'], t.key).toContain(r.perCharacter[0].verdict);
    }
  });

  it('asks about the characters linked to the entry; with none linked, the ones linked to no guild', () => {
    const chars = [
      { name: 'Aldenmar', flags: READY, playerGuildId: E1 },
      { name: 'Brackwyn', flags: READY, playerGuildId: E2 },
      { name: 'Corvale', flags: READY, playerGuildId: null },
    ];
    const key = { [targetKeyOf(E1, sundayKey)]: 'saryrn', [targetKeyOf(E2, sundayKey)]: 'saryrn' };
    const two = [ENTRY(), ENTRY({ id: E2, guildName: 'Second Guild' })];
    const names = (rs, id) => rs.find(x => x.entryId === id && x.dateKey === sundayKey).perCharacter.map(c => c.name);
    const linked = buildMyRaids(BASE({ entries: two, targetsByEntryDate: key, characters: chars }), NOW);
    expect(names(linked, E1)).toEqual(['Aldenmar']);
    expect(names(linked, E2)).toEqual(['Brackwyn']);
    const none = buildMyRaids(BASE({ entries: two, targetsByEntryDate: key, characters: chars.map(c => ({ ...c, playerGuildId: null })) }), NOW);
    expect(names(none, E1)).toEqual(['Aldenmar', 'Brackwyn', 'Corvale']);
  });

  it('returns every guild\'s raids in time order, and never more than the cap of entries', () => {
    const many = Array.from({ length: 14 }, (_, i) => ENTRY({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, guildName: `Guild ${i}` }));
    const rs = buildMyRaids(BASE({ entries: many }), NOW);
    expect(new Set(rs.map(r => r.entryId)).size).toBe(MAX_GUILD_ENTRIES);
    for (let i = 1; i < rs.length; i++) expect(rs[i].startMs).toBeGreaterThanOrEqual(rs[i - 1].startMs);
  });
});

describe('label and entry rules', () => {
  it('normalises a typed name like the paste path: NFKC, control and zero-width characters out, spaces collapsed', () => {
    expect(cleanLabel('  The​  Pack\u0007 ')).toBe('The Pack');
    expect(cleanLabel('ＡＢＣ Raiders')).toBe('ABC Raiders');   // full-width letters
    expect(cleanLabel('a')).toBeNull();
    expect(cleanLabel('x'.repeat(41))).toBeNull();
    expect(cleanLabel('x'.repeat(40))).toBe('x'.repeat(40));
    expect(cleanLabel(7)).toBeNull();
  });
  it('validates days 0..6, the time, the length and the zone', () => {
    const ok = { guildId: null, label: 'Some Guild', days: ['0', '3', 3], start: '20:30', durationMin: '180', tz: 'America/Chicago' };
    const v = validateEntry(ok);
    expect(v.ok).toBe(true);
    expect(v.value.days).toEqual([0, 3]);
    expect(v.value.durationMin).toBe(180);
    for (const bad of [{ days: ['7'] }, { days: ['-1'] }, { start: '25:00' }, { start: '29:00' }, { durationMin: '10' }, { durationMin: '601' }, { tz: 'Nowhere/Land' }, { label: 'a' }]) {
      expect(validateEntry({ ...ok, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('a registered guild wins over a typed name, and needs one of the two', () => {
    expect(validateEntry({ guildId: 'breakfast-club', label: 'ignored', days: [] }).value.label).toBeNull();
    expect(validateEntry({ days: [] }).ok).toBe(false);
  });
});

describe('the calendar', () => {
  it('parses ?m=, shifts across a year, and lays a month out in Sunday-first weeks', () => {
    expect(parseMonth('2026-11')).toEqual({ y: 2026, m: 11 });
    for (const bad of ['2026-13', '2026-1', 'x', undefined, '1999-01']) expect(parseMonth(bad)).toBeNull();
    expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    const weeks = monthCells(2026, 11, []);   // Nov 1 2026 is a Sunday
    expect(weeks[0][0].day).toBe(1);
    expect(weeks.every(w => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean).length).toBe(30);
  });
  it('puts a raid on its own day in its own zone', () => {
    const NOW = Date.UTC(2026, 10, 15, 12);
    const rs = buildMyRaids(BASE({ days: 30 }), NOW);
    const cell = monthCells(2026, 11, rs).flat().find(c => c && c.day === 22);
    expect(cell.raids.length).toBe(1);
    expect(monthCells(2026, 11, rs).flat().find(c => c && c.day === 23).raids).toEqual([]);
  });
});

// ── the writes, over a stub database ────────────────────────────────────────────────────────────────────────────────
function stubDb({ guilds = [], characters = [], hubGuilds = [{ guild_id: 'breakfast-club' }] } = {}) {
  const tables = { hub_player_guilds: guilds, hub_characters: characters, hub_guilds: hubGuilds, hub_player_targets: [] };
  const ops = [];
  const from = (table) => {
    const q = { table, filters: [], kind: 'select', payload: null };
    const rows = () => (tables[table] ?? []).filter(r => q.filters.every(([c, v]) => v === null ? r[c] == null : r[c] === v));
    const done = () => {
      if (q.kind !== 'select') ops.push({ table, kind: q.kind, payload: q.payload, filters: [...q.filters] });
      return q;
    };
    const api = {
      select(_c, opts) { q.opts = opts; return api; },
      eq(c, v) { q.filters.push([c, v]); return api; },
      is(c, v) { q.filters.push([c, v]); return api; },
      update(p) { q.kind = 'update'; q.payload = p; return api; },
      delete() { q.kind = 'delete'; return api; },
      insert(p) { q.kind = 'insert'; q.payload = p; return Promise.resolve({ error: null, ...(done(), {}) }); },
      upsert(p) { q.kind = 'upsert'; q.payload = p; done(); return Promise.resolve({ error: null }); },
      maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
      then(res) {
        done();
        const hits = rows();
        res(q.opts?.head ? { count: hits.length, error: null } : { data: q.kind === 'update' ? hits.map(h => ({ name_lc: h.name_lc })) : hits, error: null });
      },
    };
    return api;
  };
  return { db: { from }, ops };
}
const VALID = { guildId: null, label: 'Some Guild', days: [0], start: '20:30', durationMin: 180, tz: 'America/New_York' };
const writes = (ops) => ops.filter(o => o.kind !== 'select');

describe('the writes are scoped to the signed-in player', () => {
  const MINE = { id: E1, player_id: 'player-a' };
  const HERS = { id: E2, player_id: 'player-b' };

  it('refuses to update an entry that belongs to another player, and writes nothing', async () => {
    const { db, ops } = stubDb({ guilds: [MINE, HERS] });
    const r = await saveEntry(db, 'player-a', E2, VALID);
    expect(r.ok).toBe(false);
    expect(writes(ops)).toEqual([]);
  });
  it('updates its own entry, filtered by the entry AND the player', async () => {
    const { db, ops } = stubDb({ guilds: [MINE, HERS] });
    expect((await saveEntry(db, 'player-a', E1, VALID)).ok).toBe(true);
    const w = writes(ops);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('update');
    expect(w[0].filters).toEqual(expect.arrayContaining([['id', E1], ['player_id', 'player-a']]));
  });
  it('refuses to remove, set a target on, or link a character to another player\'s entry', async () => {
    const { db, ops } = stubDb({ guilds: [MINE, HERS], characters: [{ player_id: 'player-a', name_lc: 'aldenmar' }] });
    expect((await removeEntry(db, 'player-a', E2)).ok).toBe(false);
    expect((await setTarget(db, 'player-a', E2, '2026-11-18', 'saryrn')).ok).toBe(false);
    expect((await linkCharacter(db, 'player-a', 'Aldenmar', E2)).ok).toBe(false);
    expect(writes(ops)).toEqual([]);
  });
  it('a character link only touches the player\'s own character rows', async () => {
    const { db, ops } = stubDb({ guilds: [MINE], characters: [{ player_id: 'player-a', name_lc: 'aldenmar' }, { player_id: 'player-b', name_lc: 'aldenmar' }] });
    expect((await linkCharacter(db, 'player-a', 'Aldenmar', E1)).ok).toBe(true);
    expect(writes(ops)[0].filters).toEqual(expect.arrayContaining([['player_id', 'player-a'], ['name_lc', 'aldenmar']]));
    expect((await linkCharacter(db, 'player-c', 'Aldenmar', '')).ok).toBe(false);   // not their character: nothing matched
  });
  it('one Save links several characters, and stops at another player\'s entry', async () => {
    const { db, ops } = stubDb({ guilds: [MINE, HERS], characters: [{ player_id: 'player-a', name_lc: 'aldenmar' }, { player_id: 'player-a', name_lc: 'brackwyn' }] });
    expect((await linkCharacters(db, 'player-a', [{ name: 'Aldenmar', id: E1 }, { name: 'Brackwyn', id: E1 }])).ok).toBe(true);
    expect(writes(ops)).toHaveLength(2);
    expect((await linkCharacters(db, 'player-a', [{ name: 'Aldenmar', id: E2 }])).ok).toBe(false);
    expect(writes(ops)).toHaveLength(2);
    expect((await linkCharacters(db, 'player-a', 'not a list')).ok).toBe(false);
    expect((await linkCharacters(db, 'player-a', Array(201).fill({ name: 'Aldenmar', id: E1 }))).ok).toBe(false);
  });
  it('sets and clears a target only from the catalog and a real date', async () => {
    const { db, ops } = stubDb({ guilds: [MINE] });
    expect((await setTarget(db, 'player-a', E1, '2026-11-18', 'saryrn')).ok).toBe(true);
    expect(writes(ops)[0].payload).toMatchObject({ player_guild_id: E1, player_id: 'player-a', raid_date: '2026-11-18', target_key: 'saryrn' });
    expect((await setTarget(db, 'player-a', E1, '2026-11-18', 'nope')).ok).toBe(false);
    expect((await setTarget(db, 'player-a', E1, '2026-02-30', 'saryrn')).ok).toBe(false);
    expect((await setTarget(db, 'player-a', E1, '2026-11-18', '')).ok).toBe(true);
    expect(writes(ops).at(-1).kind).toBe('delete');
  });
  it('caps the list at ten and refuses a guild that is not registered', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, player_id: 'player-a' }));
    const full = stubDb({ guilds: ten });
    expect((await saveEntry(full.db, 'player-a', null, VALID)).ok).toBe(false);
    expect(writes(full.ops)).toEqual([]);
    const { db, ops } = stubDb({ guilds: [] });
    expect((await saveEntry(db, 'player-a', null, { ...VALID, guildId: 'ghost-guild', label: null })).ok).toBe(false);
    expect((await saveEntry(db, 'player-a', null, VALID)).ok).toBe(true);
    expect(writes(ops)[0].payload).toMatchObject({ player_id: 'player-a', guild_label: 'Some Guild' });
  });
});

// ── what cannot be run here: the shape of the wiring ────────────────────────────────────────────────────────────────
describe('the wiring', () => {
  it('the route is open on a raidmimic host, and has its own link card (name and description)', () => {
    expect(isRaidmimicOpenPath('/raids')).toBe(true);
    expect(isRaidmimicOpenPath('/raidsx')).toBe(false);
    const meta = metaForPath('/raids');
    expect(meta.title).toMatch(/My raids/);
    expect(meta.description.length).toBeGreaterThan(40);
  });
  // On beta the nav is sectioned (lib/raidmimicNav.ts): My raids leads the Raids section; on main it leads the flat NAV.
  it('the nav leads with My raids', () => {
    const flat = stripJs(src('web/components/RaidmimicFrame.tsx'));
    if (flat.includes("label: 'My raids'")) {
      const at = (s) => flat.indexOf(s);
      expect(at("label: 'My raids'")).toBeLessThan(at("label: 'My characters'"));
      expect(at("label: 'My characters'")).toBeLessThan(at("label: 'Demo'"));
    } else {
      const nav = stripJs(src('web/lib/raidmimicNav.ts'));
      const raids = nav.slice(nav.indexOf("key: 'raids'"));
      expect(raids.indexOf("href: '/raids'")).toBeGreaterThan(0);
      expect(raids.indexOf("label: 'My raids'")).toBeLessThan(raids.indexOf("label: 'Next raid"));
    }
  });
  it('the signed-in home leads with an Upcoming raids card linking to /raids', () => {
    const dash = stripJs(src('web/app/raidmimic/_landing/HomeDashboard.tsx'));
    expect(dash.indexOf('data-card="raids"')).toBeGreaterThan(0);
    expect(dash.indexOf('data-card="raids"')).toBeLessThan(dash.indexOf('data-card="characters"'));
    expect(dash).toMatch(/href="\/raids"/);
  });
  it('the actions take no player id from the form and every database call goes through the scoped writes', () => {
    const a = stripJs(src('web/app/raids/actions.ts'));
    expect(a).not.toMatch(/get(All)?\('(player|player_id|playerId|discord)/);
    expect(a).toMatch(/discordIdOf\(user\)/);
    expect(a).toMatch(/makeLimiter\(/);
    expect(a).not.toMatch(/\.from\('hub_player_/);
  });
  it('the page is the [beta] new route: signed-in only, metadata for the tab, plain-text output', () => {
    const p = stripJs(src('web/app/raids/page.tsx'));
    expect(p).toContain('[beta]');
    expect(p).toMatch(/export function generateMetadata/);
    expect(p).toMatch(/<SignInButton next="\/raids"/);
    expect(p).not.toMatch(/dangerouslySetInnerHTML/);
    expect(p).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);   // Tailwind tokens, no hex
  });
  it('the migration: RLS on, nothing for anon or authenticated, the unique index, the cascade, and the delete', () => {
    const m = stripSql(src('supabase/migrations/20261115140000_hub_player_guilds.sql'));
    for (const t of ['hub_player_guilds', 'hub_player_targets']) {
      expect(m).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`));
      expect(m).toMatch(new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
    }
    expect(m).toMatch(/create unique index if not exists hub_player_guilds_unique\s+on public\.hub_player_guilds \(player_id, coalesce\(guild_id, ''\), lower\(coalesce\(guild_label, ''\)\)\)/);
    expect(m).toMatch(/player_id\s+uuid\s+not null references public\.hub_players \(player_id\) on delete cascade/);
    expect(m).toMatch(/check \(guild_id is not null or guild_label is not null\)/);
    expect(m).toMatch(/add column if not exists player_guild_id uuid null references public\.hub_player_guilds \(id\) on delete set null/);
    expect(m).toMatch(/delete from public\.hub_player_guilds where player_id = v_player;/);
    expect(m).toMatch(/delete from public\.hub_player_targets where player_id = v_player;/);
    expect(m).not.toMatch(/grant[^;]*\bto (anon|authenticated|public)\b/);
  });
  it('the data export lists both tables as personal sections, with explicit columns', () => {
    for (const t of ['hub_player_guilds', 'hub_player_targets']) {
      const spec = SELF_TABLES.find(s => s.table === t);
      expect(spec, t).toBeTruthy();
      expect(spec.group).toBe('personal');
      expect(spec.select).not.toContain('*');
    }
    expect(SELF_TABLES.find(s => s.table === 'hub_characters').select).toContain('player_guild_id');
  });
});
