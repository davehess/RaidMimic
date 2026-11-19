# Audit: what the server's quest scripts do that our `eqemu_*` copy cannot show (2026-11-19)

The ask (the guild lead, 2026-11-19): *"look for scripts or elements that we don't have in our database copy."*
Dataset: `data/quest-scripted.json` (shape test: `test/quest-scripted-data.test.js`). Extractor:
`scripts/quest-scripted-extract.js`.

## TLDR

- The server spawns **1,040 distinct NPC ids** from scripts (2,362 call sites). **980 of them have no `spawn2` row in
  our copy** (213 in the Planes of Power zones). Those mobs exist in `eqemu_npc_types` but a map or "where does it
  spawn" query finds nothing, because the script, not a spawn point, places them.
- A further **601 ids are named in zone scripts but are unplaced** (375 in PoP). These are references, not proven
  spawns; table-driven spawns such as the Plane of Earth trap ladder (`poeartha/encounters/Traps.lua`) are all here.
- **Script-given loot is small: 158 rows** from `AddItem`. **Nine items are on no loot table at all** in our copy
  (Crown of Narandi, Eye of Narandi, Choker of the Wretched, Faceguard of Bentos the Hero, Earring of the Frozen
  Skull, Crystalline Silk Thread, Grats Bloodfrenzy, Halfling Head, Runed Iron Bound Chest); one more id (67030) is not
  in `eqemu_items`.
- **The War Drums of the Rathe drop from the Ancient Vekerchiki Champion is not explained by any script.** Item 27998
  appears in the scripts only in `sql/2026_10_09_Elemental_Instrument_Lootdrops.sql`, which attaches it to Peregrin
  Rockskull (218374, loottable 4478) and that is already in our copy. Our copy gives the Champion (218382) loottable
  4247, which does not list 27998. Most likely the live server's loot table for the Champion is newer than our last
  sync (npc/spawn/items tables synced 2026-11-01). Re-sync and compare before assuming a script.
- The server's `sql/` patch files (33 of them: respawn alignment, key progression, loot headers) are **already in our
  copy** where they touch mirrored tables (checked: lootdrop headers 218374 and 217425 exist, the Putrescent Blood
  loot table and drop exist). The gap there is tables we do not mirror at all, listed below.

## Counts

| Category | Count |
|---|---|
| Script files read (`.lua`) | 5,849 |
| Spawn call sites (`eq.spawn2`, `eq.unique_spawn`; `tests/` excluded) | 2,362 (1,888 spawn2, 474 unique_spawn) |
| ...in Planes of Power zones (expansion 4, zone ids 200+) | 441 |
| Call sites whose npc id the extractor could not resolve to one number (table or variable) | 107 (65 PoP) |
| Distinct npc ids spawned by script | 1,040 |
| ...with no spawn row (`no_spawn_rows`, plus 2 `spawngroup_without_spawn2`) | 980 (PoP 213, other zones 764, shared modules 15; see note) |
| ...already placed by a normal `spawn2` row | 49 |
| ...absent from `eqemu_npc_types` | 11 |
| Call sites by position: literal coordinates / at an existing mob / computed | 1,462 / 687 / 213 |
| Unplaced ids referenced in own-zone scripts, not a direct spawn argument (`script_refs`) | 601 (375 PoP) |
| `AddItem` loot rows | 158 (61 PoP) |
| `eq.update_spawn_timer` / `eq.spawn_condition` overrides | 227 |

Note on the 15: ids spawned from `lua_modules/` or `global/`, which are not tied to one zone.

**Ids not in `eqemu_npc_types`.** Ten are one template script (`<zone>/Lorisyn_Oakwynd.lua:6`, eleven copies, one per
zone) that spawns a "Giant Werewolf" for a Halloween event every hour: 4209, 22209, 30244, 33246, 38239, 46221, 47353,
54388, 56331, 68340. The 4209 id appears in two zones. The eleventh is `240000`, spawned by
`poair/encounters/Wind.lua:173`. They are seasonal or stub content, not PoP loot or a named mob; our copy lacks the
NPC rows themselves, so these cannot be named from the database.

## Planes of Power: what our copy lacks

`direct` = the id is an argument to a spawn call (a confirmed script spawn). `ref` = the id is written in a script of
that zone and unplaced, which says it matters to the script but not how (it can be a table-driven spawn, an event
registration, or a despawn list). Counts are distinct ids per zone.

| Zone | Spawn call sites | direct ids, no spawn row | ref-only ids | Unresolved call sites | Script-only mechanics worth having |
|---|---|---|---|---|---|
| codecay | 19 | 15 | 15 | 2 | Bertox, Paffa, Adan summons; 3 `update_spawn_timer` |
| pojustice | 38 | 25 | 35 | 8 | six Trial controllers (`#Event_*_Control`), Tribunal waves |
| ponightmare | 81 | 21 | 4 | 3 | Maze spawns (computed coords), Mujaki, Hatchling |
| podisease | 6 | 3 | 3 | 1 | Aramin spawn |
| poinnovation | 5 | 4 | 8 | 1 | Endurance room, Giwin Mirakon turn-in loot copy |
| potorment | 19 | 13 | 2 | 0 | Baraguj, Tylis, Argan Milek |
| povalor | 1 | 1 | 1 | 0 | |
| bothunder | 15 | 10 | 4 | 1 | Askr the Lost (209156, 209157), progression loot (below) |
| postorms | 21 | 13 | 18 | 8 | the four elemental lords, 3 `spawn_condition` calls, medallion loot |
| hohonora | 18 | 10 | 27 | 4 | trial/villager events, 9 `update_spawn_timer` |
| solrotower | 24 | 13 | 9 | 1 | Rizlona and Jiva forms |
| potactics | 35 | 13 | 9 | 3 | Rallos Zek and the Zek war gods (214311-214320, 223144) |
| poair | 32 | 26 | 16 | 3 | Avatars of Dust/Mist/Smoke/Wind, Inlokher, Chamberlain Escalardian, Xegony |
| powater | 5 | 0 | 31 | 5 | Coirnav and Fishlords (refs: Fishlord Lezom, Fishlord Craiyk, Pwelon, Nrinda, Vamuil) |
| pofire | 1 | 0 | 16 | 1 | Fennin event; refs include Azobian, Javonn, Hebabbilys, Reaxnous, Chancellors, Omni Magus Crato, Fennin Ro |
| poeartha | 6 | 5 | 51 | 1 | Trap ladder (13 helpers), Stone Ring (Peregrin Rockskull 218374), 10 `update_spawn_timer` |
| poearthb | 0 | 0 | 2 | 0 | Avatar of Earth and Essence of Earth (refs), 19 `update_spawn_timer`, Rathe council |
| potimeb | 113 | 40 | 120 | 22 | the five Time phases; Quarm 223008, Zebuxoruk, Druzzil Ro, Terlok, Kazrok, Anar, Neimon, Rythor |
| nightmareb | 2 | 1 | 3 | 1 | Terris Thule |
| hohonorb, potimea | 0 | 0 | 1, 0 | 0 | |

Per-zone call counts of other script-only mechanics (timers / signals / depops / `update_spawn_timer` / `set_global` /
`set_data`) for PoP, all from `grep` over the checkout: poair 52/23/72/0/0/0, pojustice 48/14/55/2/4/5, potimeb
59/29/58/0/7/0, potactics 61/6/26/1/8/2, hohonora 52/13/16/9/3/0, poeartha 27/4/32/10/1/2, poearthb 17/3/10/19/0/2.
Across all zones: `eq.set_timer` 1,764; `eq.signal` 727; `eq.depop_with_timer` 581; `eq.depop_all` 363;
`eq.spawn_condition` 156; `eq.update_spawn_timer` 76; `eq.set_global` 186; `eq.get_data`/`eq.set_data` 44.

### Named mobs the scripts place and our copy does not (PoP, direct spawn calls)

Plane of Air Avatars of Dust, Mist, Smoke, Wind (215391-215394), Inlokher the Warlord (215409), Chamberlain Escalardian
(215411), Melernil Faal`Armanna (215399); Plane of Time B Quarm (223008), Zebuxoruk (223159), Druzzil Ro (223160),
Terlok of Earth, Kazrok of Fire, Anar of Water, Neimon of Air, Rythor of the Undead (223018-223044); Plane of Tactics
Rallos Zek, Tallon Zek, Vallon Zek forms (214311-214320); Bothunder Askr the Lost (209156, 209157), Karana (209136); Hall
of Honor A Alekson Garn, Trydan Faye, Rhaliq Trell, Rydda`Dar (211106-211117); Justice trial bosses (201477-201496);
Torment Baraguj Szuul, Tylis Newleaf, Argan Milek (207318-207322); Solusek Ro Tower Rizlona (212407); Nightmare
Terris Thule (204483), Deyid the Twisted (204461), hobgoblin lords (204479-204482); Storms Drornok, Jeplak, Falto,
Ston`Ruak (210469-210472); Codecay Bertoxxulous, Overlord Banord Paffa, the Adan brothers.
Plane of Earth A is the `ref` case: Peregrin Rockskull (218374), Calris Bristlebranch, Glimmerstone, Galsinak
Earthrumble, Tribal Leader Diseranon, **An Ancient Vekerchiki Champion (218382)** and the other trap-ladder named and
placeholders, all spawned by `TRAP_SPAWNS` at the trap helper's position when the 5th pull of that trap lands.

### Script loot (`AddItem`)

| Where | Item(s) | How |
|---|---|---|
| `postorms/encounters/Neffiken.lua`, `Gurebk.lua`, `Jeplak.lua`, `MiniBosses.lua` | Esoteric Medallion (28783 / 28780 / 28765) | Added on spawn or phase; MiniBosses gives 1 to 3 copies (2 on guild id 1). The medallions are on loot tables too (1 entry each); the script adds copies on top |
| `bothunder/encounters/ProgressionLoot.lua` | Ring of Torden 17168 x3 (four storm lords), Unadorned Symbol of Torden 17169 x1 (eight), and 25% component gems/spheres 9421-9424, 9429-9432 | On spawn; the loot tables already list them with a chance, so the script makes them guaranteed or adds an extra roll |
| `greatdivide/encounters/Ring10.lua:1077-1097` | Crown of Narandi 1746, Eye of Narandi 1745, Choker of the Wretched 1742, Faceguard of Bentos the Hero 1743, Earring of the Frozen Skull 1744 | In the Ring 10 event script, one `AddItem` per item; **on no loot table** |
| `velketor/*.lua` (9 mob scripts) | Crystalline Silk Thread 1829 | Up to nine `AddItem` lines per mob; **on no loot table** |
| `grimling/encounters/GrimlingWar.lua` | Grats Bloodfrenzy 2661 | Four named war leaders, in two places in the script; **on no loot table** |
| `misty/Bronin_Higginsbot.lua:37`, `katta/a_vah_shir_courier.lua:20`, `chardok/#Historian_Silren_Di-zok.lua:3` | Halfling Head 13111, Runed Iron Bound Chest 17079, item 67030 (not in `eqemu_items`) | Single placements |
| `poinnovation/` and `potactics/Giwin_Mirakon.lua` | whatever was handed in | Copies a no-drop turn-in back onto the mob; no fixed item |

Not extracted: quest turn-in rewards (`QuestReward` 3,215 calls, `SummonCursorItem` 1,023). They are rewards, not
loot, and belong to a quest-tracker feature (see `eqemu_quest_scripts` and the `20260924140000` migration).

## Elements outside the `eqemu_*` mirror that the scripts and `sql/` patches depend on

Server tables with no counterpart in our copy (seen in the `sql/` patch files and script calls): `respawn_times`
(instance lockout timers; the reason `spawn2.respawntime` is a sentinel), `spawn_condition*` and `spawn_events`
(`eq.spawn_condition` calls name them), `keyring_data`, `character_loot_lockouts`, `pok_lift_*`, and the sync
tables the October patches added (`pop_named_cycle_alignment`, `pop_final_cycle_sync`, `pop_elemental_gate_sync`,
`hoh_trial_starter_sync`, `gintolaken_prerequisite_sync`, `fire_mini_restore`, `torment_key_spawn_weights`). The
patches set PoP respawn cycles (66-hour mini cycles, final-plane lockout alignment) in `respawn_times` and `spawn2`;
the `spawn2` side we have, the `respawn_times` side we do not. `eqemu_quest_scripts` already holds the script text
(5,725 files, last synced 2026-11-08; the checkout read today has 5,849, so 124 files are newer).

## Method

1. `git clone --depth 1` of `SecretsOTheP/quests` (branch `main`) into an empty directory outside the repo; read as
   text only, nothing run. **Commit read: `f94be3347f984d13754695c48940d7a65f4ec387`.**
2. `scripts/quest-scripted-extract.js` strips comments (line numbers kept), resolves `local NAME = 123` constants by
   nearest preceding line, splits call arguments with bracket and string awareness, and records every
   `eq.spawn2(npc, grid, guildfilter, x, y, z, heading)` / `eq.unique_spawn(...)` (coordinates as written),
   `eq.ChooseRandom` ids, `X:AddItem(id, ...)`, `[npc] = item` loot tables, `eq.update_spawn_timer` and
   `eq.spawn_condition`. It also lists ids written in a zone script that fall in that zone's own npc range.
3. Joined to the mirror with read-only queries: `eqemu_npc_types` (existence, name), `eqemu_spawnentry` joined to
   `eqemu_spawn2` (placed or not), `eqemu_lootdrop_entries` and `eqemu_npc_drops` (item on a loot table).
   `tests/` was dropped from the spawn list (test fixtures, not behaviour).

## Limits

- The mirror was read as it stands (npc/spawn/items last synced 2026-11-01); a row added since would show here as a gap.
- Spawns reached through a table lookup or variable (107 call sites) cannot be resolved by a text scan; they are in
  the JSON with `npc_expr` and appear in the PoP count only when the id is also written literally elsewhere in that zone's
  scripts (`script_refs`). Counts of `ref` ids are an upper bound on script-only mobs.
- 687 spawn sites place the mob at an existing mob's position (`loc: at_existing_mob`) and 213 compute it; only 1,462
  have map coordinates. Whether a script spawn is gated (flags, other mobs dead, timer) is in the script, not the data.
- `spawn2` argument order is `(npc_id, grid, guildfilter, x, y, z, heading)`; whether x/y match EverQuest's /loc order
  was not verified against a live position.
- Loot: only `AddItem`; turn-in rewards, `lootdrop` edits by SQL at runtime and Lua `SummonItem` are not covered.
- `placed` ids (49) have no name in the dataset (not fetched).

## Recommendation: how to load it

**Recommended: a table fed by the weekly sync, with the committed JSON as the offline snapshot.**
1. Run the extractor from `sync-quarm.yml` after the script mirror step (the scripts are already in
   `eqemu_quest_scripts`; the extractor takes a checkout, so check the repo out in that job) and upsert into two
   tables, `eqemu_script_spawns` and `eqemu_script_loot`, with `db` recomputed on load. A table lets maps (zone
   spawns), Mob Info and the item "where it drops" pages join it with plain SQL, and refreshes when the server changes.
2. Keep `data/quest-scripted.json` regenerated by the same job as the offline snapshot for tests and for the agent
   (only a PoP slice; the full file is 0.9 MB, too large to bundle).
3. A one-off table with no sync would be right the day it is loaded and wrong after the next server patch (the repo
   changed 124 script files since our last script sync). A bundled file alone cannot be joined in SQL.
4. Before loading, decide the `ref` rows: they are leads, not facts. Load them with a `kind = 'referenced'` flag, never
   mixed with `direct` spawns on a map.

To do (needs the guild lead's yes): create the two tables (migration, non-destructive, applied through the usual
approval step), add the extractor step to `sync-quarm.yml`, then re-sync the npc/loot tables to settle whether the
Champion's War Drums drop is simply a newer loot table.
