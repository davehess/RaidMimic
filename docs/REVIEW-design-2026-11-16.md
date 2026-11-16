# Design review of wolfpack.quest and Raid Mimic (2026-11-16) and how we are working it

A deliberately hypercritical outside review (a second Claude session with a browser, signed in as the guild lead, ~1550px
wide; it clicked no admin controls). The guild lead handed it over the same day: *"We have QUITE a bit of work to do
overall. Please consume this, internalize it into the decision desk for references. For obvious elements please roll it out
onto beta so I can click through. For taste and design preferences please render several options and show them to me. Start
with base design, so everything can feel like one site."* Member and character names in the original are replaced by roles
here (the repo is public). Not verified by the reviewer: signed-out view, mobile breakpoints, keyboard and screen reader.

## How to work every item (the review's own rules, adopted)
- Screenshot the page before and after every UI change and look at both. "Done" means the rendered page meets the acceptance
  line, not that the code compiles.
- Every colour, font size and spacing value comes from tokens (`web/app/tokens.css`, `docs/DESIGN-theming.md`).
- No explanatory paragraphs to rescue a confusing control: fix the control.
- Obvious fixes go straight to `beta` for the guild lead to click through; taste calls get rendered options on the Decision
  Desk first.

## The process failures it names
1. No design tokens in practice: colour, type and spacing decided per page (orange = heading, warning and damage at once).
2. Two products on one domain: an editorial serif home page over monospace admin-console inner pages with emoji.
3. Internals leak into the UI: admin chips, developer notes, localhost links, "Old layout" links, A/B labels.
4. "Done" claimed without looking: all 52 timeline events at `0:00`, "Unknown zone" under a zone the list knows, "0 kills"
   above two kill cards.
5. Paragraphs explaining a control instead of fixing it.

## Items, priority order, and where each stands

| # | Item | Severity | Kind | Status |
|---|---|---|---|---|
| 1 | One design system (tokens + type) applied everywhere | Critical | base + taste (font voice, icons) | **preview on beta (b035882b)**: tokens v2; `https://b.wolfpack.quest/?ds=a|b|c` (or the "Design" chip bottom-right) turns one title style, AA greys, nothing under 11px, one link style and the voice on across the whole beta site; `?ds=off` returns to today's look; `https://b.wolfpack.quest/design` is the style guide. Pages still carry their own classes: the component sweep follows the Desk pick (`ui-standard`) |
| 2 | Admin chips (`ADMIN · Wipe · Live · PvP · Test · Non-Guild`, `Clear`) on every /parses card: hide behind an admin mode; destructive actions get a real confirm | Critical | obvious, style is taste | queued (tranche 2) |
| 3 | Developer copy: footer "localhost:7779" line for everyone; /leaderboards internals ("view-backed", "/syncopendkp"); /me "UI Studio" + localhost; parse "Old layout" and bare "[PQDI]" links; /parses "Week window (newest 250)" and "Click here for more info" | Critical | obvious | footer line **gone on beta** (/me keeps its local-dashboard link; the site cannot detect Mimic without Chrome's Local Network Access prompt); the rest tranche 2 |
| 4 | Parse Timeline: all events at `0:00` (Deaths 4 of 9 too), a flat list where a time axis was promised | Critical | bug obvious, the axis view is taste | timestamps tranche 2; axis view rendered as options |
| 5 | Header: nav collapses to "Menu" on scroll at desktop; unlabelled icon buttons; three download chips; 15+ controls | High | obvious | **on beta (ed7df76c)**: nav stays on scroll (folds below 1024px or when it truly does not fit); Tour/Feedback/Admin labelled from 1280px, aria-label + title everywhere; one Download menu on both sites; OpenDKP + test server in More. Graduates to main after the guild lead clicks through |
| 6 | One meaning per colour (accent = CTA + current nav; status colours = status; emphasis by weight/size; one link style) | High | base | in the base-design preview; then swept page by page |
| 7 | /boards: title first, "Coming up in the next 24h" then "On cooldown", "Available now" collapsed to counts, >48h in days | High | obvious | tranche 2 |
| 8 | Data and label bugs: parse "Unknown zone"; /parses "0 kills" above kill cards; "Yesterday" above "Today"; /me connected count vs the list; attendance chip dates ×3; home "Last six kills" unlabelled numbers and 5 links for 6 rows; `\` prefixes in "Outside the raid" | High | obvious | tranche 2 |
| 9 | /leaderboards ranks single-encounter damage by total (rewards long fights); one character fills about a third of the top 30 | Medium | decision | Desk card `leaderboard-ranking` |
| 10 | /parses and /me sit on skeletons 3–5 s | Medium | obvious | tranche 3 (profile first) |
| 11 | Parse detail: class bar all blues; dead gap between Class and DPS; Deaths timestamps all red, no "killed by" | Medium | obvious | tranche 2 |
| 12 | Home page: headline over the wolf's face; one dense pitch block; feature list styled as footnotes; header logo is the Mimic chest, not the wolf | Medium | taste (brand) | Desk card `wq-brand` |
| 13 | Raid Mimic PoP flags screen | Medium | taste | round 2 rendered (D1/D2/D3) on Desk card `ui-standard` |
| 14 | raidmimic.com/demo: numbers disagree between pages; "Option A / B" labels; three nav layers; repeated disclaimer; clipped "What's left"; grammar ("the 1 who need it"); keep "Next raid" as the landing | Deferred | separate slice | later |

## Definition of done (the review's)
- A token file exists and all pages use it.
- A non-admin sees no admin controls.
- No developer copy, localhost links or leftover links reach non-admins.
- Timeline renders on a time axis with correct offsets.
- Primary nav is visible at desktop width after scrolling.
- /boards leads with the next 24 hours.
- Every item-8 bug is fixed or explained.
- Before/after screenshots exist for every page touched.
