# Handoff: the design review and the one-site work (2026-11-16, evening ET)

The session that started the outside design review grew too long and stopped. This is everything the next session needs
to carry on without guessing. Read with: `docs/REVIEW-design-2026-11-16.md` (the tracked list), `docs/DESIGN-theming.md`
§8 (the audit and the standard), `docs/decisions/inbox/2026-11-16.md` §598–§603, the Decision Desk artifact (find it by
title, "Wolf Pack Decision Desk"; picks are read from its `picks` collection). Roles, not names, throughout. Private
material (the guild lead's home box, a credential to delete) is in the private briefing: see the pointer in §9.

**The session that wrote this pushes nothing more to `beta` or `main`** (the guild lead's instruction).

---

## 1. In flight: branches, worktrees, scratchpad

Everything of value is on `main`, `beta` or a `draft/*` branch. The scratchpad is gone with the old session.

| Where | What | How finished | Next step |
|---|---|---|---|
| `beta` b76f93d9, ed7df76c, b035882b, 78100af9 (web) | The design-system **preview** (tokens v2 + `?ds=a/b/c` + Design chip + `/design` style guide with real boss timers) and the **header fixes** (nav stays on scroll, labelled icons, one Download menu, More menu, footer localhost line removed) | Built, tested, live on `https://b.wolfpack.quest`. Not on `main` | Graduate to `main` **together** after the guild lead clicks through (they touch `layout.tsx`, `middleware.ts`, `globals.css`, `tokens.css`, the headers: a partial graduation conflicts the beta sync, §602). Since the voice is now picked (B), graduating should make B the real default, not ship the preview switch to production: see §8 step 2 |
| `beta` agent 4.0.95 (0d4c4232), 4.0.96 (f82aac20), Mimic 3.1.0-beta.15 | PoP flags on this PC; colour back on the local pages (they never loaded `tokens.css`); "On this PC" opens in the dashboard window with a ↗ for its own window; rail heading "Live" | Shipped to beta. Not cut to stable | Guild lead checks in Mimic; cut with the next stable |
| `beta` 3b3ce2d4 (Mimic) | Target Info distance coloured green / orange / red | Shipped, Mimic beta.14 | Guild lead checks in game |
| `main` a3fff12b (web 2.2.10) | `/pop/raid` by tier (picked B), 85% door line | Live | Guild lead checks the real page signed in (§7) |
| `draft/design-mocks-2026-11-16` (52463fc0) | The static mock pages behind Desk card `ui-standard`: round 1 (voices a/b/c), round 2 (layouts d1/d2/d3), preview screenshots, the Plane of Air ring notes (`research/poair-rings.md`) | Reference only; `gen.js` has an old absolute output path | Use as the visual target for the D2 build; never merge |
| `draft/rm-copy-2026-11-16` (578fc036) | A raidmimic.com copy-trim commit (costs, demo, register pages, `raidmimicSetup.ts`) whose five files differ from `main` | Probably superseded by the web 2.2.4 graduation; not verified line by line | Diff against `main`; keep anything still wanted, else delete the branch |
| Session branch `claude/sharp-lamport-dC0TW` | Old session branch | Behind `main`; carries nothing `main` lacks | Ignore |

Local worktrees of the old session (`wt-*`) are all either on `beta`/`main` or listed above; none needs recovering.

## 2. The design review: true status of every item

Status as of this handoff (the review doc's table is updated to match). "Done" means the rendered page meets the
acceptance line, checked with a before/after screenshot.

| # | Item | Status | Done looks like |
|---|---|---|---|
| 1 | One design system | **Picked** (Desk `ui-standard`): voice B (sans + tabular numbers), layout D2 two panes, zero cells lifted to AA, stacked cards on phones, landing follows the pick, overlays stay mono until one is tested, order: Mimic local pages + dashboard first. Preview live on beta only | Every page renders from the tokens and the `web/components/ui` parts; `grep` finds ~0 hex outside `tokens.css`; one type stack; no emoji in chrome (icons pick still open, §8) |
| 2 | Admin chips on parse cards | **Picked: a ⋯ menu on each card** (not the recommended site-wide switch). Not built | A non-admin sees zero admin chips; an admin opens them from ⋯; Clear/Wipe ask in a real confirm, never `alert()` |
| 3 | Developer copy | Footer localhost line **gone on beta**. Rest not started | Read every page as a raider: no "view-backed", "/syncopendkp", "UI Studio" or localhost on /me, no "Old layout" / bare "[PQDI]", no "Week window (newest 250)", no "Click here" |
| 4 | Timeline 0:00 | Not started | No two events share `0:00` unless they truly happened together; pre-pull marked as pre-pull. The time-axis view is a later options round |
| 5 | Header | **On beta**, not `main` | At 1440 the nav is unchanged after scrolling (verified signed out only); every control named without hovering |
| 6 | One meaning per colour | In the preview (headings neutral, gold = partial/DKP). Page-by-page not started | Accent = primary action + current nav only; status colours = status only |
| 7 | /boards order | Not started | Title first; "Coming up in the next 24h" then "On cooldown"; "Available now" collapsed to counts; >48h in days. Acceptance: a raid leader names the next 3 spawns in 5 seconds |
| 8 | Data and label bugs | Not started | Each of: parse "Unknown zone"; "0 kills" above kill cards; Yesterday above Today; /me "connected on 2 characters" vs the list; attendance dates ×3; home "Last six kills" unlabelled numbers + 5 links for 6 rows; `\` prefixes in "Outside the raid" — fixed or explained |
| 9 | Leaderboard ranking | **Picked A, floor 30 seconds** (not the recommended 60). Not built | Single-encounter board by DPS, fights ≥ 30 s, each character's best once; character and boss links styled differently |
| 10 | Load time | Not started (tranche 3) | Profile first; above-the-fold summary streams or is cached |
| 11 | Parse detail polish | Not started | Class bar in distinct colours or labels; damage bar in its own column; Deaths timestamps neutral, your death highlighted, "killed by" |
| 12 | Home page + brand | **Picked A: the wolf on wolfpack.quest — "the whole wolf not just the eyes"**. Not built. Home hero layout not started | Header shows the full wolf mark on wolfpack.quest; Raid Mimic surfaces keep the Mimic chest |
| 13 | PoP flags screen | **Picked D2** (two panes) with the D3 tier ladder as a tab in the detail. Not built | Matches `draft/design-mocks-2026-11-16/round2/d2-*.png`, real data, phone = list then full-screen sheet |
| 14 | raidmimic.com demo | **Moved into tranche 2 by the guild lead** (was deferred). Not started | One set of numbers across demo pages; no "Option A/B" labels; one nav; disclaimer once; "What's left" not clipped; grammar fixed; "Next raid" is the landing |

Started but not previously recorded: `/design` samples switched to the real `bot_boards` timers and made members-only
(beta 78100af9, after the guild lead: *"These examples are crappy. Nagafen isn't killable every day, let alone three days
in a row. Use real timers."*).

**Tranche 2, in this order** (each straight to `beta`, before/after screenshots, then graduate in one batch):
1. Item 8 data bugs (correctness first: a wrong number is worse than an ugly one).
2. Item 3 developer copy (all pages).
3. Item 2 admin ⋯ menu per card + a real confirm for destructive actions.
4. Item 4 timeline timestamps (the bug only; the axis view goes to the Desk as options).
5. Item 7 /boards order.
6. Item 11 parse detail polish.
7. Item 14 the demo cleanup.

## 3. Decision Desk: every card made or touched today

All picks below were read from the Desk's `picks` collection at handoff time.

| Card id | Question | Options (recommended *) | When | Answer |
|---|---|---|---|---|
| `mobinfo-range` | Target Info distance + radii display | A* bigger coloured line · B range chips | now | **A**, orange inside assist: yes. Shipped (Mimic beta.14) |
| `pop-raid-tiers` | /pop/raid by tier: folded or sidebar | B* folded tiers · C sidebar | now | **B**; Tier One one line; 85/15 line inside Elemental/Time: yes. Shipped (web 2.2.10) |
| `ui-standard` | Which layout becomes the standard page pattern (round 2) | D1 dense table · D2* two panes · D3 tier ladder (as a tab in D2) · P phone reference | now | **D2**. Follow-ups: voice **B**; overlays keep mono, test one first; zero cells lift to AA; landing follows the pick; phone tables stacked cards; order Mimic local + dashboard first. Note: *"Every overlay should have the ability to resize text and the entire window like we can with Canvas. We are inconsistent across the board"* |
| `design-review-1116` | Work order for the review | A* base first, then tranches · B bugs first | now | **A**. Admin chips: **a ⋯ menu on each card** (recommended was one Admin mode switch). Demo: **do it with tranche 2** (recommended was keep deferred) |
| `wq-brand` | Which logo heads wolfpack.quest | A* the guild's wolf · B the Mimic chest everywhere | week | **A**, note *"A, but with the whole wolf not just the eyes"* |
| `leaderboard-ranking` | How the single-encounter board ranks | A* DPS with minimum length, best once · B total, best once · C per boss | week | **A**, floor **30 seconds** (recommended 60) |

Asked in chat but **not on the Desk** and not answered:
- "My parses" twice (dashboard tab vs "My fights (this PC)"): A* one tab whose rows open the fight detail · B everything on the local page.
- `hesstastic.com` mentions in docs: A keep · B* swap for "the guild lead's site".
- CH chain overlay: a floater role + rampage-victims list (recommended before a Plane of Air raid).
- Whether the Mimic logo or the guild's logo heads a guild site was asked in chat; the Desk's `wq-brand` answer (wolf) settles it for wolfpack.quest.

Desk housekeeping: this session's watch on the Desk could not be registered (the session hit its 10-watch limit), so it
was never notified of picks; it read them when the guild lead said "updated".

## 4. How the guild lead wants to work (learned this session)

Folded into `CLAUDE.md` in the same commit as this doc (the "one look" working rule). The quotes, dated 2026-11-16:
- On uniformity: *"too many pages use different fonts, layouts, etc. There's no uniformity. It should be the same, fit
  into the same crisp package, work on both mobile and desktop, but with different layouts."*
- On sample data: *"These examples are crappy. Nagafen isn't killable every day, let alone three days in a row. Use real
  timers."* Mocks must use real data or at least real game mechanics; an implausible example reads as not knowing the game.
- On wordiness: *"Least wordy as possible"* (the /pop/raid tiers).
- On duplicates: *"we have a my parses section, so why do we need a second one?"*
- On verifying: *"Where is the color on these local pages?"* — the local pages had been grey for weeks because nobody
  looked at the rendered page. The outside review says the same: *"'Done' is claimed without looking."*
- On incomplete data: *"That's very inaccurate. Almost all of those characters were in our raid last night in Plane of
  Air"* — a list built from records that stop short was presented as fact. Say what the data cannot show; never fill the
  gap with a confident answer.
- On windows: *"these 'On this PC' links should be able to load in the same window, not external unless people want to
  launch in a new window"*; *"Live shouldn't be Live-raid night"*.
- On branding: *"Should be using the mimic logo though"* (Raid Mimic surfaces); the wolf on wolfpack.quest, *"the whole
  wolf not just the eyes"*.
- On overlays (Desk note): every overlay should resize its text and its whole window the way the Canvas does.
- The handover itself: *"For obvious elements please roll it out onto beta so I can click through. For taste and design
  preferences please render several options and show them to me."* Answers come on the Desk; in chat they say "updated".
- Reply shape stays as `CLAUDE.md` says (TLDR, details, numbered to-do, a recommendation, a picture per option). Give
  links, not paths. The guild lead reads on a phone: keep it short.
- They want a heads-up before any approval prompt (CLAUDE.md rule of 2026-11-15); Execute SQL read queries no longer
  need one (*"connector updating you don't need to prompt me"*).

## 5. Hazards hit today

- **The beta sync failed silently for ~12 hours** (§602): graduations put picked versions on `main` while `beta` still held
  the previews, so every `sync-beta.yml` run conflicted. Nobody is notified. After any graduation, take the preview off
  `beta` in the same change and check the next sync run is green. The hand repair (9ceaa160) **missed three unstaged test
  edits** — a merge commit only takes what is staged — fixed in f031d432. Check `git status` before committing a merge.
- **The preview switch is beta-only in three places**: `dsChoice(..., isBeta)` in the middleware, the layout, and the
  chip render. The root layout **must not call `cookies()`** (`test/guild-theme.test.js` guards it), so the middleware
  passes the choice on the `x-wp-ds` request header (it deletes any incoming copy first). **Statically built pages**
  (`export const dynamic = 'force-static'`, e.g. `/privacy`) cannot read the request at all: a tiny boot script sets
  `data-ds` from the cookie before paint, and `<html>` carries `suppressHydrationWarning` on beta.
- **b.raidmimic.com does not get the preview**: its cookie is per host, its layout branch has no chip, and the
  middleware's raidmimic-host branch returns before the preview step. Fix that before asking for raidmimic.com picks.
- **The preview is CSS overrides on `html[data-ds]`**, not the real standard. Pages keep their own classes; inline styles
  and emoji are untouched. When a page moves to the `ui/` components, check the overrides do not double-apply.
- **Tests that pass but guard little**: most page tests assert on source text (`stripJs` + `toMatch`), so they prove a
  string exists, not that the page renders. The design-system test checks the preview rules' scope by text. Contrast
  ratios on `/design` are computed at render, not asserted. Moving JSX between files breaks many text tests (the tier
  split broke five); run the **full** suite, not just the files an agent named — two agents reported a green gate that
  missed failures.
- **Known local test failures**: 5 (`anon-feedback-surface` ×1, `legal-pages` ×4) fail only in worktrees with
  `web/node_modules` linked; anything beyond those five is real.
- **The repo was renamed to `davehess/RaidMimic`.** Pushes to the old name redirect; the raw GitHub API needs the new
  name (`/repos/davehess/RaidMimic/...`), and the GitHub MCP tools are still scoped to the old name.
- **Sub-agents broke the Edit/Write rule** (python string replaces, `sed`); diffs were fine but review them.
- **The credential form (`request_credential`) cannot save in a very long session**; retrying fails the same way. Use a
  fresh session or the environment's settings.
- **Next dev server**: started with `nohup … &` inside one Bash call it died between calls; start it as a background task.
- **Artifact watches**: a session holds at most 10; past that no watch registers and the session is never told of picks
  or comments. Read the Desk's `picks` collection directly.
- **The flag records are incomplete** (§598): `pop_flags` stops at the elemental entry step and misses most later steps;
  /pop/raid shows "not recorded" rather than "missing" for raiders without a full read in 14 days. Never present a list
  built from those records as fact.

## 6. Dates

- Today: Mon 2026-11-16. Raid nights this week: **Wed 11-18, Thu 11-19, Sun 11-22**, 8:30 PM ET (plans run to 12:30 AM).
  **Deploy freeze for `main`: 19:30 → 00:30 ET on each of those nights** (`[hotfix]` only). Beta pushes are fine.
- Wednesday's raid is Plane of Air (the Elemental Planes planning artifact has the ring plan and a healers section:
  6-cleric CH chain plus floaters, recommended, not confirmed by raid leaders).
- **After 2026-11-23**: delete the parse page's `?v=old` and the beta lab copies (web 2.2.7). Same week: audit-15 phase 2
  (token fallback off, then null the plaintext; wire `sweepIdleSessions`).
- Waiting on the guild lead, since:
  - 2026-11-16: click through beta in `?ds=b` (member pages included) and approve the header for `main`; check
    `/pop/raid` and `/design` signed in; check Target Info colours and the local PoP flags page in Mimic beta.15; test
    Discord sign-in now that it shows `raidmimic.supabase.co`; the three chat-only questions in §3.
  - 2026-11-15/16: two private items (§9).
  - Older: the code-signing publisher name.

## 7. Verification: how, and what nobody has seen

- Screenshots came from a local `next dev` in a worktree with dummy env: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy`, `SUPABASE_SERVICE_ROLE_KEY=dummy`, and `VERCEL_GIT_COMMIT_REF=beta` to switch the
  beta flag on; Playwright (`require('playwright')`, run with `NODE_PATH=$(npm root -g)`). Only **signed-out public pages**
  render: every member page redirects to sign-in, and nothing reads real data.
- Seen rendered: `/about`, `/privacy` (today vs B), `/design` (before it went members-only, with the old fake rows), the
  header signed out at 1440/390, the static mocks, the local PoP flags page against a fake API.
- **Never seen rendered, for the guild lead to check signed in**: `https://b.wolfpack.quest/design` (real timers);
  `https://wolfpack.quest/pop/raid` (the tier page with real raiders); `https://b.wolfpack.quest/me`, `/parses`, `/boards`,
  `/leaderboards` in `?ds=b`; the header **signed in** at 1440 (search, Tour, Admin, avatar may not fit with labels and
  fold to Menu); the local PoP flags page and Target Info colours inside Mimic beta.15.

## 8. What I would do next, in order

1. **Make every page one site (the base, for real).** Voice B and D2 are picked. Recommendation: flip the defaults in
   `tokens.css` (sans body, text-coloured titles, AA greys) behind no switch, keep `?ds=off` on beta as the "before", and
   graduate with the header in one batch after the guild lead's click-through. Then replace page titles with
   `ui/PageHeader` site-wide (a codemod: 156 pages hand-roll their title) — that is the single change that makes it read
   as one site.
2. **Tranche 2** in the order of §2, to beta, with before/after screenshots each.
3. **Mimic local pages + dashboard on the standard** (the picked order): PoP flags as the first D2 page with the tier
   ladder tab; then the dashboard's tables/buttons onto the shared parts. Recommendation: build `ui/TwoPane` properly from
   `web/app/design/TwoPane.tsx` and use it for PoP flags, parses and inventory.
4. **Leaderboard** per the pick (DPS, ≥ 30 s, best once).
5. **wolfpack.quest header logo**: the whole wolf.
6. **Overlay sizing**: every overlay resizes text and window like the Canvas (the Desk note). Recommendation: audit which
   overlays lack it first and put the approach on the Desk with options.
7. Put the three chat-only questions (§3) on the Desk with pictures; recommendations as listed.

## 9. Private

Two items that concern the guild lead's own machines and a credential live in the private briefing ("Wolf Pack —
private briefing", Read aloud + Home lab tabs), not here.
