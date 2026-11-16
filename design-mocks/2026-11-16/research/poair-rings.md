# Plane of Air: what each ring needs (research, 2026-11-16)

**Pinned commit:** `SecretsOTheP/quests` @ `60e979f34e96b4d98b5e566139c2471e00259d0f` (HEAD of `main`, committed Sun Nov 1 2026). Every `file:lines` below is a path in that repo at that commit. DB facts are from our Supabase mirror (`eqemu_*`), read-only, queried 2026-11-16.

Coordinates: scripts give `x, y, z, heading` to the spawn call. EverQuest `/loc` shows **Y, X, Z**, so every `/loc` below is the script's (y, x, z). "Not in the script" marks anything inferred, not read.

## 0. Read this first: two modes, and which one Wolf Pack is in is not in the script

`poair/script_init.lua:3-9` loads the ring encounters (Wind, Smoke, Mist, Dust, Xegony) only when the zone's guild id is above 1, or is 1 *and* `guild_one_raid_window_open()`. So there are two behaviours:

1. **Guild instance (guild id 2+).** `lua_modules/air_ring_recovery.lua` is installed by each ring (`Wind.lua:314`, `Smoke.lua:267`, `Mist.lua:239`, `Dust.lua:337`; the install returns at once when guild id <= 1, `air_ring_recovery.lua:56`). It replaces the encounter file's handlers ("The server replaces this encounter's handler", `:455-457`), counts only confirmed deaths, and carries real attempt timers. **Most of this document describes this mode.**
2. **Guild 1 (the shared zone), only while the server's raid window is open.** The encounter file's own logic runs (the comment at `Dust.lua:28-29` calls it "the earthquake behavior"). Every ring signal returns early when the raid window is closed (`Wind.lua:120-122`, `Smoke.lua:104-106`, `Mist.lua:103-105`, `Dust.lua:143-145`). There is **no attempt timer** in this mode (`FailAttempt` returns at once for guild 1: `Dust.lua:41`, `Mist.lua:40`, `Smoke.lua:39`, `Wind.lua:51`). A stalled ring simply sits until the 66 hour island timer, or whatever the server's quake does (the quake itself is not in these scripts).

Differences are called out per ring. **Ask which mode the raid zone is.** (Not in the script: what the guild lead's Wednesday zone is.)

Ring numbers (1 = Wind, 2 = Smoke, 3 = Mist, 4 = Dust) are inferred from the load order in `script_init.lua:5-9` and the `offset=1..4` in `air_ring_recovery.lua:13,15,18,21`. The scripts never call them "ring 1" etc.

## 1. What is common to all four rings

| Item | Value | Source |
|---|---|---|
| Island repop timer, between kills | **18 minutes** (1,080,000 ms) | `CheckIsland` in each encounter: `Wind.lua:77`, `Smoke.lua:64`, `Mist.lua:63`, `Dust.lua:67`; instance: `air_ring_recovery.lua:363` (`deadline=now+1080`) |
| Island clear, then island back | **66 hours** (237,600,000 ms / 237,600 s) | `Wind.lua:86`, `Smoke.lua:73`, `Mist.lua:72`, `Dust.lua:77`; `air_ring_recovery.lua:5` |
| Attempt window after island clear (instance only) | **3 hours** | `air_ring_recovery.lua:7`, `:258-260` |
| Retry after a failed attempt (instance only) | **15 minutes** after the attempt expires, then the whole island repops | `air_ring_recovery.lua:6,:262,:231-239`; legacy twin: `Wind.lua:61`, `Smoke.lua:48`, `Mist.lua:47`, `Dust.lua:51` (`expires + 900`) |
| Avatar out-of-combat timer | **2.5 hours** (9,000,000 ms), paused while it is in combat, resumes when combat ends | `Wind.lua:249,254-258`, `Smoke.lua:195,200-204`, `Mist.lua:172,177-181`, `Dust.lua:263,268-272`; instance keeps the remainder across reloads: `air_ring_recovery.lua:8,:160-161,:225-230,:419-432` |
| Natural respawn of every island point | 14,400 s = 4 h, all enabled | DB `eqemu_spawn2.respawntime`, all 102 island ids |
| "Is the island clear?" check | Looks at the **spawn point**, not the mob type: every island spawn id must hold no living NPC | `Wind.lua:75-80` etc.: `GetSpawnByID(id):GetNPC().valid`; instance `air_ring_recovery.lua:365-368` |
| Stall rule (instance) | Each island death sets the deadline to now + 18 min. If 18 min pass with the island not clear, `reset_island` repops every island point and wipes the count. First clock starts when the controller loads: 18 min + ring offset (1-4 s). | `air_ring_recovery.lua:133,:231-239,:267,:362-363` |
| Stall rule (guild 1) | Same 18 min timer is reset to 18 min on every island kill that leaves some alive; when it fires, `RepopIsland` repops all island points (and clears any started event) | `Wind.lua:99-115`, `Smoke.lua:86-99`, `Mist.lua:85-98`, `Dust.lua:90-111` |
| Zone unload mid-ring (instance) | A fresh zone **resets an unfinished ring back to its island**; only Avatar, cooldown and failed phases are kept | `air_ring_recovery.lua:244-254` |

**Avatar-available marker ("guy" NPC).** Each ring has a level-1 marker NPC (`stormrider_guy` 215414, `elemental_guy` 215415, `phoenix_guy` 215416, `spider_man` 215417), one spawn point each at (-1587, 1052), respawn 237,600 s (DB). The boss stage spawns the **real** boss only if the marker is alive; otherwise a weak stand-in (placeholder) appears and killing it gives **no Avatar**: Wind `Wind.lua:163-177`, Smoke `Smoke.lua:144-154`, Mist `Mist.lua:137-141`, Dust `Dust.lua:99,:187-196,:307-308`; instance `air_ring_recovery.lua:157-158,:203-204,:406`. The Avatar's spawn removes the marker for another 66 hours (`BossDeath*` each `eq.depop_with_timer(GUY_TYPE)`; instance `:304-309`). **Inferred, not in the script:** the marker returns 66 h after the Avatar appears, the island 66 h after the island was cleared, so a guild that clears the island early in a cycle can reach the boss stage with the marker still absent. Check what is on the board before Wednesday.

**Avatar loot (DB `eqemu_npc_drops`).** Every Avatar drops its Mystical Essence at 100%: Wind 28639, Smoke 28640, Mist 28641, Dust 28642. Also on every Avatar: Globe of Pure Air 3%, Fog Fragment 10%, Gaseous Condensate 8%, Diamond 2.5%, Blue Diamond 1%, Spectral Parchment (25% table), Glyphed Rune Word (50% table x4). Ring-specific gear/patterns differ (Wind: Fine Hammered Faceguard, Ensorcelled Metalcloth Cape, Air Fetish, bracer patterns/molds; Smoke: Puremetal Band, Woven Steel Sash, glove patterns/molds, Alabaster Hilted Wind Bow 10%; Mist: Whispering Air Bangle, Band of Swirling Air, Heavy Bludgeoner, helm patterns/molds; Dust: sleeve/vambrace patterns/molds, more in the list). **How the Wind Etched Key (28638) is made from the four essences is not in these scripts**; grep of the whole repo finds item 28638 only in `poair/player.lua:92-96`.

Avatar stats (DB `eqemu_npc_types`): all four level 75, 750,000 HP, see_invis, aggro radius 100, special abilities `1,1^2,1^4,1,20,0,50^7,1^8,1^13,1^14,1^15,1^16,1^21,1^23,1^31,1^46,1^49,1`.

**Avatar behaviour (all four):** about once a minute the Avatar cuts its current target's hate to 1% (`Dust.lua:289-296`, same in Wind/Mist/`Smoke.lua:228-237`). **Wind, Mist and Dust (not Smoke):** when combat ends it warps back to its guard point and heals 30% max HP if its HP is under 50%, or with chance (100 - HP%) otherwise (`Wind.lua:264-268`, `Mist.lua:187-191`, `Dust.lua:278-282`). Smoke's `AvatarCombat` has no such block (`Smoke.lua:198-206`), so the Smoke Avatar does not warp and heal on a wipe.

## 2. Ring 1: Wind (Avatar of Wind)

Encounter `poair/encounters/Wind.lua`; controller `POAStormriderController` 215420.

**To start the event.** Every one of the **27** island spawn ids must hold no living NPC (`Wind.lua:15-17`; `CheckIsland` `:72-88`). Each death of a Stormrider Lightningclaw (215013), Mischievous Stormrider (215002) or Fearsome Stormrider (215014) signals the controller (`:298-300`, `IslandDeath :182-185`); on the last one `eventActive=true` and the next stage spawns (`:124-153`).
- Instance: the death must be a native on one of the 27 island points (`air_ring_recovery.lua:357-361`) and the check is "every island point empty" (`:365-368`). Then `transition("priest")` (`:373`).
- DB: all 27 points are enabled, 100% native (215002 / 215013 / 215014), respawn 14,400 s, in /loc Y -881 to -451, X -662 to -121, Z 106-113.
- **Skippable:** other mobs of the same three types that stand on **non-island** points. In guild 1 their deaths do send the signal (no spawn-point filter, `:182-185`) but cannot clear the island by themselves; in the instance they are ignored (`:360`). DB non-island points of these types: Mischievous at /loc -683, -232, 113 and -8, -152, 31; Lightningclaw at /loc -610, -483, 110; Fearsome at /loc 23, -74, 5.7 (respawn 900 s) and -23, -76, 5.7 (1,230 s). Every other mob in the area (Temple Guardians, Nilborien, Doomseekers, `storm_ent`, etc.) has no check.

**Stages after it starts.**
1. Priest. 8 Menacing Stormriders (215386, level 64, 42,000 HP) spawn at the 8 `MENACING_LOCS` and move toward the priest area; they "wake" (lose no-aggro, become attackable) at 60, 60, 120, 120, 180, 180, 240, 240 s (`:135-150,:187-205`). The Stormrider Priest of Destruction (215387, level 66, 157,000 HP) spawns at /loc -677, -259, 115 (`:152`). **Only the priest must die** (`:218-227` death_complete; instance `air_ring_recovery.lua:394` `priest -> traps`). When he dies the riders are depopped (`:219`; instance cleanup `:218-224`). **The 8 riders need not be killed.**
2. Traps. 4 traps (215424 `storm_boss_inv`) at random spots, x -589..-169, y -842..-498, z 115 (`:221-226`; instance picks them at `:162-165`). Each trap that gets into combat becomes a **Sporadic Stormrider** (215388, level 66, 78,000 HP) at the same spot and the trap despawns (`:229-234`; instance `:412-418`). Guild 1: when no sporadic, trap or boss is alive, signal 2 spawns the boss stage (`:155-179`). Instance: all four sporadics must die (`:395`, `all_dead("sporadic",4)`). **4 traps, 4 sporadics: not skippable.**
3. Boss. If the marker is alive: 5 Pherlondien Clawpikes at the 5 `BOSS_LOCS` (`:28-34`), one random real (215390: level 68, 550,000 HP, aggro 100) and four fakes (215389: 27,400 HP) (`:165-174`). Fakes: /loc -644,-342; -631,-401; -598,-383; -656,-382; -608,-348. Without the marker, one Loathesome Stormclaw (215425, 42,000 HP) at /loc -627, -369, 105.75 (`:176`) whose death gives no Avatar. **Only the real boss death spawns the Avatar** (`:240-245`; the death_complete of the real type only, `:306`). Fakes are depopped (`:244`).
4. Avatar of Wind (215391) at **/loc 484, -1591, 15** (script `-1591, 484, 15`, `:242`). Shout: "I will certainly make sure that no mortal is allowed to defile this sacred realm!" (`:248`). Out of combat 2.5 h (`:249`). Drops: Mystical Essence of Wind 100% (DB, above).

**Timers / fail paths.** Guild 1: none beyond Section 1 (the 18 min repop applies only while the island is not clear; after a clear the timer is 66 h, `:86`; an event that is stuck stays stuck). Instance: 3 h attempt from island clear (`air_ring_recovery.lua:258-260`); on expiry the attempt fails, all stage mobs depop, 15 min later the island repops (`:262-267,:231-239`).

## 3. Ring 2: Smoke (Avatar of Smoke)

Encounter `poair/encounters/Smoke.lua`; controller `POAElementalController` 215421.

**To start the event.** **21** island spawn ids (`Smoke.lua:13-15`). Natives: A Confused Air Elemental 215012 (99%) and A Swirling Elemental Force 215039 (1%) at every island point (DB). Confused Air Elemental death always counts (`:160-163`); a Swirling Force counts **only if its spawn point is one of the 21 island ids** (`:165-180`). Each counted death increments `kills`.
- Instance: needs all 21 distinct island deaths *and* every island point empty (`air_ring_recovery.lua:369-370`), then `transition("champions")` (`:374`).
- The champions are spawned **by kill count, while the island is still being cleared**: kill 5, 10, 15 and 21 each spawn one Elemental Champion (`:16-21,:108-113`; instance `:174-179`). They cannot be attacked (no-aggro/immune/no-harm abilities 24,25,35 in DB) until kill 21, when the script flips them to attackable (`:115-133`; instance `:295`, `unlock`).
- **Skippable:** the 19 Swirling Elemental Force spawn points that are not on the island (DB: 19 points of 215039 spread across x -1610..1708, respawn 2,640 s) and An Elemental Doomseeker etc. The script explicitly ignores them (`:165-175`).

**Stages.**
1. Champions: **4** (215395: 100,000 HP; 215447: 125,000; 215448: 250,000; 215449 "small": 100,000; all level 67, aggro 600), at /loc -1274,-491; -1208,-434; -1283,-395; -1341,-452 (z 320-324) (`:16-21`). All four must die (guild 1: signal 2 fires when none of the four types is alive, `:137-157`; instance `:396`, needs `champ5, champ10, champ15, champ21` dead).
2. Boss: An Elemental Masterpiece (215396, level 72, 550,000 HP, aggro 600) at /loc -1284, -445, 323 if the marker lives (`:146`), else An Elemental Anomaly (215427, 50,000 HP) with no Avatar (`:154`).
3. Avatar of Smoke (215392) at **/loc -680, 1396, 18** (script `1396, -680, 18`, `:189`). Shout: "The time has come for all intruders to be tested I will not allow you to pillage this plane any longer!" (`:194`). 2.5 h out of combat (`:195`). Drops Mystical Essence of Smoke 100%. No warp-and-heal on a wipe (see Section 1).

**Timers.** In guild 1 `kills` resets to 0 and the island repops and champions/boss depop when the 18-min timer fires (`:86-99`), so progress is lost on a >18 min gap; plus 66 h after a clear. Instance as Section 1.

## 4. Ring 3: Mist (Avatar of Mist)

Encounter `poair/encounters/Mist.lua`; controller `POAPhoenixController` 215423.

**To start.** **19** island spawn ids (`Mist.lua:16-17`). Natives (DB): A Wind Phoenix 215026 (90%) / Servitor of Xegony 215027 (90%) / Phoenix Searedwing 215028 (7%) / Phoenix Breezewing 215058 (7%) / Calebgrothiel 215324 (3%); a death of any of 215026, 215027, 215058, 215028, 215324 signals the controller (`:221-226`). The wizard Wind Phoenix 215450 is **not** an island death: its death only spawns two Ardent Phoenixes of Xegony at /loc -655, 592 and -667, 618 (`:150-154`, registered `:222`).
- Instance: island points empty, then `fire` (`air_ring_recovery.lua:375`); natives list `:18`.
- **Skippable (DB, non-island points of the same types):** Servitor of Xegony at /loc -692, -674, 113.7 and -712, 366, 438.7 (respawn 10,200 s); the wizard Wind Phoenix at /loc -621, 624, 442.6; an extra Wind Phoenix at /loc 0, 0, 334.2 (respawn 10,200 s). Guild 1 counts deaths of Servitors on those points as a signal (`:223`) but they cannot clear the island; instance ignores them.

**Stages.**
1. Four Phoenix Firesurgers (215397, level 65, 75,300 HP) at /loc -741,369; -678,348; -762,302; -696,284 (z 438-440) (`:18-23,:117-120`). All four must die (`:122-130`; instance `air_ring_recovery.lua:397`).
2. Four Phoenix Windsurgers (215398, level 68, 89,300 HP) at the same four points (`:125-129`). All four must die (`:132-143`; instance `:398`).
3. Boss: Melernil Faal`Armanna (215399, level 73, 550,000 HP, aggro 600) at /loc -718, 326, 441 if the marker lives (`:138`); else A Firewing Imitor (215429, 30,000 HP), no Avatar (`:140`).
4. Avatar of Mist (215393) at **/loc -570, -1573, 356** (script `-1573, -570, 356.125`, `:166`). Shout: "Leave now foolish mortal you have begun to send events in motion that you cannot possibly understand!" (`:171`). 2.5 h out of combat. Drops Mystical Essence of Mist 100%.

**Timers.** Section 1; guild 1 also depops Firesurgers/Windsurgers/boss when the 18-min timer fires on an active event (`:87-93`).

## 5. Ring 4: Dust (Avatar of Dust)

Encounter `poair/encounters/Dust.lua`; controller `POASpiderController` 215422.

**To start.** **35** island spawn ids (`Dust.lua:14-17`). Natives (DB): A Crystalline Windwalker 215043, A Pristine Recluse 215044, A Vorladien Webspinner 215045 (99% each), #Lossenmachar 215060 (1%); deaths of any of the four signal the controller (`:316-319`). **There are no other natives outside the 35** (DB query: no 215043/44/45/60 spawn points elsewhere), which is why Dust "needs all 35". Sigismond's size grows with the kill count (`:160-168`; instance `air_ring_recovery.lua:321-324`); cosmetic.
- Instance: all 35 points empty, then `dust_end = now + 3600` and `arch1` (`:376`).

**Stages (instance and guild 1 agree).**
1. Archwalker wave 1: one Vorladien Archwalker (215400, level 69, 183,000 HP) at /loc 640, -452, 438 (script `-452, 640, 437.576`, `Dust.lua:126`). Dies, then 3 Vorladien Spawn (215401, level 68, 105,000 HP) appear on its corpse, hate-seeded with the clients that were on the Archwalker's hate list (`:229-247`; instance `air_ring_recovery.lua:472-477,:301-303`). All 3 must die, then wave 2 (guild 1: `:182-185` spawns the next Archwalker when no Spawn/Archwalker is alive and `archwalkerKills < 3`).
2. Waves 2 and 3: the same. **3 Archwalkers + 9 Spawn in total** (instance `:399-404`).
3. After wave 3's Spawn are dead, Sigismond Windwalker becomes attackable (guild 1: abilities 24/25/35 off, `:187-193`; instance `:296` `unlock(n,21)`). Sigismond 215375: level 74, 600,000 HP, aggro 600, placed at /loc 889, -400, 434 (spawn id 366131, respawn 237,600 s in DB). If he is gone (marker missing) An Ominous Recluse (215428, 50,000 HP) spawns at the same spot instead (`:195`), no Avatar.
4. Avatar of Dust (215394) at **/loc 527, 1671, 344** (script `1671, 527, 344`, `:257`). Shout: "Elementals of Air and Dust, I call upon you to aid me in the defense of this land!" (`:262`). 2.5 h out of combat (`:263`). Drops Mystical Essence of Dust 100%.

**Erratic Arachnids (the add that respawns).** 15 spawn points (ids 369505-369519, one spawngroup 225666, DB: An Erratic Arachnid 215402, level 50, 15,700 HP, respawn **1 s**, `enabled=false` by default). The script turns them **on** when the island clears (`Dust.lua:176`, `ToggleErraticSpawns`, `:129-139`) and **off** in three places: when the last wave dies and the boss is made attackable (placeholder path only: `:196`), when the boss finishes (`:256`), and on the 18-min timer/fail (`:103`, `:45`). In the instance, `enable_erratics` mirrors the phase: on for `arch*`, `adds*` and a real boss stage; off otherwise (`air_ring_recovery.lua:136-148,:147-149,:269`), and any Erratic is depopped when the phase is not active (`:449`). They walk to the island kill spot / the boss and are **not counted by any check** (no death handler is registered for 215402, only spawn and timer: `Dust.lua:321-322`; instance `air_ring_recovery.lua:478`). **They never need killing.** Whether `Disable()` despawns the living ones (the field report says `Disable(bool depop = true)` on EQMacEmu) is **not in the script**; the scripts call `Disable()` with no argument (`Dust.lua:135`, `air_ring_recovery.lua:143` calls `p:Disable()`).

**Timers.** Instance: the three waves must finish **within 1 hour of the island clearing** (`air_ring_recovery.lua:376,:260`; `dust_end=0` is set on entering the boss stage, `:158`), the whole ring within 3 h (`:7`). Guild 1: a `1h_despawn` timer starts when the event starts (`Dust.lua:177`); on expiry in guild 1 it only depops Erratics, Archwalkers and Spawn (`:117-121`), and **nothing re-spawns them** (no fail/reset path in guild 1 other than the 66 h / 18 min timers). Stopped when wave 3 clears (`:198`).

## 6. Xegony, the Queen of Air (and the door)

**Clicking up (the rainbow door).** `poair/player.lua:88-116`, door id 1.
- The key is item **28638 "A Wind Etched Key"** (DB). The script tests `GetItemIDAt(0) == 28638` (`:92`). Our popEvents.ts calls that "on your cursor"; what slot 0 is on this server is **not in the script**.
- First click with the key (non-GM): the key is added to the player's **key ring** (`:93-95`). After that the key-ring entry alone works (`:96`). The key is **not consumed** (no removal call anywhere in the file).
- A click with the key or key-ring key **authorizes the clicker's raid, or group if not in a raid, for 300 seconds** (`:1-28`, `AUTHORIZATION_SECONDS = 300`). Anyone in that raid/group may then click through without the key during those 5 min (`:102`). A solo player with no group/raid has no authorization key and so cannot be covered (`:4-16`).
- Success: `MovePC(215, -617, 5, 1450, 128)` = **/loc 5, -617, 1450**; the player's pet is moved (charm pet's charm is broken, `:105-111`) and the player is removed from all hate lists (`:113`). Only that single player is moved per click; `MoveGroup` (`:30-86`) is defined but nothing in these files calls it.

**Xegony the Queen of Air (215056, level 80, 1,500,000 HP, aggro 250, see_invis).** `poair/encounters/Xegony.lua`. Spawn point /loc 20, 79 (DB).
- Combat start: sets `check_hp` timer **6 s**, resets the wave list (`:107-115`). At 99% (first damage) and 85, 70, 55, 40, 25% (`:38,:125-137`) one **not-yet-used** wave out of six spawns (`:58-101`). So all six occur if she reaches 25% (six triggers, six waves).
- Each wave: the named mob spawns at its point and runs to Xegony; every unnamed mob of the matching type already in the room has its no-aggro/immune/no-harm abilities removed and runs to her (`:75-92`). Waves (named + room type, /loc Y, X, Z): Nuquernal Belegrodian + Djinni Air Defenders at 428, 23, 1437; Wesreh Galleantan + Servant of Air at 359, -352, 1440; Rindaler Egulrtan + Knight of Air at 268, -534, 1460; An Elemental Arbitor + Air Infused Defender at -339, -470, 1437; Weruis Herfadban + Air Phoenix Scout at -269, -194, 1443; Huridaf Vorgaasna + Deadly Cloudwalker at -224, 31, 1440 (`:20-27`).
- Adds drop the target's hate about every 15 s, or set it to 1 if within 30 units of Xegony (`:151-173`).
- **Nothing in her script requires any room mob to be dead before she can be pulled or killed.** The 40 room spawn points are only **repopped** whenever she spawns or combat ends (`:28-37,:44-56,:103-105,:116-122`). So the "kill only the things in the way" answer is script-side: none of the room is a gate (what physically blocks the path is not in the script).
- Combat ends with the fight over 120 s: she warps home (`:118-120`) and everything repops (`:121`). The named wave mobs are depopped each time (`:49-54`).
- No timer ends the fight on its own beyond the above; no enrage in the script.

**Who gets the flag.** On her death an **Essence of Air** (215432) spawns on her corpse via `ProjectionEligibility.Spawn(..., e.killer)` (`Xegony.lua:139-141`).
- At that moment the helper captures the killer (a pet counts as its owner), the killer's raid id / group id / (solo) character id, and **every client in this zone instance who is in the same raid or group** as saved character ids (`projection_eligibility.lua:35-62,81-92`). Not hate list, not "damage dealt": raid/group membership at the kill. If there is no valid client or pet owner as killer, **nobody gets eligibility** (`:63-67`).
- To claim, a player says "hail" to the Essence (`Essence_of_Air.lua:36`). Allowed if their character id is on the saved list, **or** they are currently in the same raid / group id as at the kill (so a late alt that joined the raid works, `projection_eligibility.lua:128-154`). Must be a real client (not a pet, `:131`).
- It summons **Item 29164 Amorphous Cloud of Air** to the cursor unless the player already has 29164 or 29165 Quintessence of Elements (`Essence_of_Air.lua:38-41`).
- At most **72 claims**, then the Essence leaves (`Essence_of_Air.lua:1,:33-34,:43-47`). It lives **20 minutes** (1,200 s), the clock pausing while it is in combat (`:11-12,:16-23`; `projection_eligibility.lua:75-79,119-127`).

## 7. Differences from `web/lib/popEvents.ts` (zone "poair")

1. **Retry after failure.** popEvents (all four rings) says "After a failed or reset attempt the island is back in 18 minutes." Script: the 18 min is the gap between island kills (stall). A **failed attempt** (3 h, or Dust's 1 h) returns the island **15 minutes after the attempt expires** (`air_ring_recovery.lua:6,:262`). In guild 1 there is no failed-attempt path at all.
2. **Wind: the 8 Menacing Stormriders are not required.** popEvents describes the flow correctly (riders, priest, riders vanish) but never says only the priest gates the traps (`air_ring_recovery.lua:394`).
3. **Wind: sporadic stormriders** need all 4 traps tripped and all 4 killed; popEvents says "when the Sporadic Stormriders are dead" (correct) without the count.
4. **Smoke:** popEvents "Kill the 21 island elementals ... Each kill counts" is right, but Swirling Elemental Forces **not on the island do not count** (`Smoke.lua:165-175`). The champions are spawned at kills 5/10/15/21, **during** the island clear, and are locked until kill 21; popEvents notes the 21 unlock but not that they appear mid-clear.
5. **Mist:** popEvents lists Wind Phoenix, Servitor, Breezewing, Searedwing and Calebgrothiel as the island clear (right) but not that the 2 extra Servitor points and the wizard Wind Phoenix point are off the island and do not count.
6. **Dust:** popEvents says "Erratic Arachnid spawn points switched on" (correct) but does not state that they never need killing, and gives the wave counts only as "three waves"; script: 3 Archwalkers + 9 Spawn. Its 1 h stage-2 limit is right, and the script starts it at island clear (`air_ring_recovery.lua:376`).
7. **Avatar marker not mentioned.** popEvents never says the real boss/Avatar needs the "guy" marker NPC and that a repeat clear inside the same ~66 h cycle yields the placeholder and **no Avatar** (`Wind.lua:163-177`, `Smoke.lua:144-154`, `Mist.lua:137-141`, `Dust.lua:99,:187-196`).
8. **Smoke Avatar** does not warp and heal on a wipe; the other three do. popEvents says nothing about this for the Avatars.
9. **Rainbow door (Xegony entry):** matches (key on cursor or key ring, 5 min raid/group cover). Missing: key ring add on first click, key not consumed, destination /loc 5, -617, 1450, and the kill-credit rule (raid/group at kill plus saved characters, 72 claims, hail).
10. popEvents "Xegony" cites `Xegony.lua:1-142`; her death handler is lines 139-141 and the adds 143-194 at this commit. The claims in that entry check out.
11. `poair-ring-wind` cites `lua_modules/air_ring_recovery.lua:1-30` for timers, which is only the config block; the timing rules are at `:231-267`.

## 8. Where the numbers came from (DB)

- Island lists were checked against `eqemu_spawn2` (zone `poair`): Wind 27/27, Smoke 21/21, Mist 19/19, Dust 35/35 ids present, all `enabled`, all `respawntime = 14400`.
- Non-island natives (the "rest"): listed per ring above, from `eqemu_spawn2 x spawnentry x npc_types`.
- Erratic points: ids 369505-369519 in spawngroup 225666, `respawntime = 1`, `enabled = false`.
- Items: 28638 A Wind Etched Key, 28639-28642 Mystical Essence of Wind/Smoke/Mist/Dust, 29164 Amorphous Cloud of Air, 29165 Quintessence of Elements (`eqemu_items`).

## 9. Surprises worth knowing

- Every ring's island clear is "every island point empty", so a single un-killed island mob (even far from the rest) holds the whole ring.
- The 18-minute gap is between **kills**, not for the whole island: a slow clear is fine if no gap passes 18 minutes (instance `:363`; guild 1 `:63`).
- Wind's Menacing riders and Dust's Erratic Arachnids are optional.
- A fresh zone start resets an unfinished ring (instance `:244-254`).
- In an instance, killing a placeholder boss (marker absent) ends the ring with no Avatar and no retry until the 66 h cycle ends (`:406`).
- Raid credit for Xegony's flag is by raid/group at the kill, plus late joiners of the same raid; nobody is credited if the killing blow is not a client or a client's pet.
