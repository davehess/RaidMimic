# Player setup path — scope (2026-11-26)

**Asked for** (the guild lead, 2026-11-26): *"we should make a decision path for players to set things up. ask during blind
mode, do you want a pop up at all? HUD and other overlays? daredevil mode? we should ask if they want specific overlays and
offer which ones are worth while. do you want these normally or just during raiding? keep updated? get notifications? scope
this from the entire suite"*.

**Status:** scoped; the shape is a pick on the Decision Desk (`setup-path`). Nothing built yet. The research behind this page
was two read-only passes over the beta checkout (file:line in each section).

## What exists

| Area | Today | Where |
|---|---|---|
| First-run page | `loading.html`: sign-in, EQ folder, characters, tells, quiet mode, **9 of the 21 overlays** as checkboxes (all off). Returning players (`cfg.onboarded`) skip it. | apps/mimic/loading.html:95-290 |
| Walkthrough | `welcome.html`: 19 steps (account, folder, characters, voice, Zeal, Set up EverQuest, run mode, GPU, a five-step overlay tour grouped "In the fight / Your character / Raid leading / Map & pulls", Ready). Opt-in: a link on the first-run page, the tray, the dashboard. | apps/mimic/welcome.html:169-214, :672-697 |
| Overlay defaults | Every overlay off except Trigger alerts (voice + visual). A class set from the bot (`/admin/overlays`) is applied silently on a never-customised install. | main.js `defaultConfig` :278-446, `_maybeSeedClassSet` :3487 |
| Blind | Six windows force-open (`mobinfo, charm, pets, triggers, me, map`), **no setting**. Callouts: "What you hear" → Blind alerts (speak / overlay / off). Map: Blind view (Map only default, or the radar), radar style, test blind; stored in the Map page, not `cfg`. | main.js `_BLIND_FORCED_KEYS` :3218; agent `builtin:blind`; map.html ⚙ → Blind |
| Raids | **No raid mode.** Raid awareness exists but gates no overlay: the bot's `raid_hold` schedule (scans and updates wait), `is_raid_window` on parses, and the Zeal raid roster (`_lastRaidPipe`). | bot index.js `_raidHoldNow` :14552; agent :13220, :14067 |
| Updates | Always download and install on quit. Channel: stable / beta / alpha (tray + dashboard). The only ask-first switch is the tray-only "Pop up when an update is ready" (`quietUpdates`). No off switch. The bundled agent hot-swaps every 15 min with crash rollback. | main.js :12219-12225, :11586-11634, :11956-12082 |
| Notifications | About ten Windows toasts with no master switch (Zeal update check can be turned off). Discord DMs: tells (per character), revisions/welcome (opt-out button), fix-report status and corpse DMs (no opt-out found). No web push. | main.js; bot index.js :22583, :23356; utils/onboarding.js |
| Where answers live | Local `mimic.config.json` only. Account-wide stores that already sync: `characters` flags (`/api/agent/character-prefs`), `wolfpack_members`, `member_onboarding_state`. No general per-account preferences table. | bot index.js :19289-19395 |

## The questions the path asks

1. **What do you do in raids?** (melee, caster, healer, tank, pet/charm, bard, raid leader) — picks a recommended overlay set
   with a "worth it" line for each. Today's class set from the bot is the starting point.
2. **Each overlay: always, raids only, or off.**
3. **When you're blinded:** tell me (say and flash; a Windows pop-up too?), which windows open (HUD ring, Target Info,
   Charm/Pet, Map), and Map only or the radar ("daredevil").
4. **Updates:** automatic or ask first; stable or beta.
5. **Notifications:** which Windows toasts, which Discord DMs.
6. Done: a summary, and where to change each later.

## What each needs that does not exist yet

- **Raids only:** a "raid" visibility state per overlay and a way to know a raid is on. Two sources exist: the Zeal raid
  roster (you are in a raid group) and the guild's raid hours (the bot's `raid_hold`). The roster works for any guild and
  any night; hours miss off-night raids and include idle evenings.
- **Blind choices:** `_BLIND_FORCED_KEYS` becomes a `cfg.blindOpen` list; a `cfg.blindNotice` for the Windows pop-up; the
  Map's Blind view and radar style move from the page's storage into `cfg` so the path can set them.
- **Updates:** `cfg.updateMode` (auto / ask), with `quietUpdates` folded in and shown outside the tray.
- **Notifications:** a `cfg.notify` set for the Windows toasts; the Discord DMs with no opt-out get one (fix-report
  status, corpse) on the account.
- **Showing it:** new installs go through it; existing players get the new questions once, without redoing the rest.

## Every choice shows a sample

The guild lead, 2026-11-26: *"we should see samples of the overlays and options when mousing over each option"*. A
requirement for every option below.
- **Interaction:** pointing at an overlay or an option (or focusing it with the keyboard, or tapping it) fills a preview
  pane. The pane shows what you would see, one line on what it shows, and the zone and mobs the sample came from.
- **Samples must be real.** They are recorded from the real overlay pages with a stand-in agent feeding real game data:
  real zone meshes, real spawn points and catalog mobs, real timers. This is how the 2026-11-26 beta clip of the blind radar
  was made, in Plane of Torment at a real Boruk/Kaniz camp.
- **Sources today:** the website has animated demos of only four overlays (Tank, Command Center, CH chain, loot; React, in
  `web/components/about/OverlayDemo.tsx`). The other 17 overlays and every blind and radar option need new recordings.
- **How (Desk follow-up `setup-samples`):**
  - Short looping clips (recommended).
  - Still pictures.
  - The live overlay running demo data inside the preview.
  - Clips and stills come from one script that drives each page with a stand-in agent. It is rerun when an overlay changes
    and ships with Mimic, a few MB in all.
  - Live previews need every overlay to accept a demo feed.
- **Cost on top of any option:** clips or stills ~2 days, mostly the stand-in feeds for 21 overlays. Live ~4 days.

## Every step says where to change it later, and the path teaches the handles

The guild lead, 2026-11-26: *"also tell them where the settings are if they want to change it later (teach them about the
drag icon and the right click spots"*. The walkthrough today never mentions the ✥ or the right-click menu.
- **A teaching step, right after the overlays are chosen.** It shows one real overlay with its four handles numbered:
  1. ✥ drag to move; overlays let clicks through to EverQuest, and the ✥ is the part you can grab.
  2. Right-click the ✥ for its menu. The real items, from preload.js: Setup ALL overlays, Setup THIS overlay, Hide this
     overlay, Stay on top, Background, Lock size, Auto-arrange overlays, Move to another screen.
  3. ⚙ for that overlay's own options.
  4. ✕ hides it; the dashboard's Overlays tab brings it back.

  The player tries them on a live overlay before moving on.
- **Every question step ends with "Change this later:"** and the exact place:

  | Setting | Where |
  |---|---|
  | Which overlays show | Dashboard → Overlays tab, the tray, or ✕ on the overlay |
  | Placement and size | ✥ drag, or right-click the ✥ → Setup THIS / Setup ALL |
  | Blind | Map ⚙ → Blind, and Dashboard → Voice → Built-in callouts → Blind alerts |
  | Updates | The dashboard header's Stable / Beta, or the tray |
  | Notifications | Once the setting exists |
  | The whole path | Tray or dashboard → Setup walkthrough |

  The last step repeats the full list.
- When a setting moves, its "Change this later" line moves in the same change: one list in code, read by the steps and
  the summary.

## Options (Desk `setup-path`)

| | What it is | Build | Maintenance | Runtime | Change |
|---|---|---|---|---|---|
| **A — Grow the walkthrough** | Four new steps in `welcome.html` (raids, blind, updates, notifications); the first run opens it instead of linking to it | ~3 days | low (one page set) | none | cheap |
| **B — Quick setup by role** | One screen: pick what you do in raids, see the whole setup it picks, "Looks good" or "Change things" (into A's steps) | A + ~2 days | medium (role presets to keep current) | none | medium |
| **C — Account setup on wolfpack.quest** | `/me/setup` on the website; every PC with Mimic pulls the answers | A + ~4 days (a table, a page, the agent pull) | medium | one small poll | medium |

The new capabilities above are the same under every option and are most of the work.
