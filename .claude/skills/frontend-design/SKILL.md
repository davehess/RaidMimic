---
name: frontend-design
description: Visual design guidance for any UI in this repo — wolfpack.quest pages, Mimic overlays, and the agent dashboard. Use when building a new page or surface, reshaping an existing one, or making choices about palette, typography, layout, or motion. Carries this platform's real design standard and the mid-raid constraints that generic design advice does not know about.
---

# Designing UI in this repo

The method comes from Anthropic's `frontend-design` skill (github.com/anthropics/skills, Apache-2.0), with a few
review checks paraphrased from Vercel Labs' web interface guidelines (github.com/vercel-labs/web-interface-guidelines,
MIT, read 2026-11-17) and benjitaylor's `stageshow` craft notes (MIT). This file adds what they cannot know: the
standard this platform already picked, and the fact that most of these screens are read by someone being hit by a
dragon. **Where this file and any generic design advice disagree, this file wins; where this file and `CLAUDE.md`
disagree, `CLAUDE.md` wins.**

## The method

**Two passes, and the second one is the point.**

1. **Plan before writing code.** Which tokens (from the standard below, not new ones), which layout per device, and
   ONE signature element.
2. **Critique the plan before building.** Has it collapsed into a generic default (see the tells below)? Does it fit
   the subject's own world (raiding in EverQuest), with real game data in every sample? Only then write code.

Ground choices in the subject; let structure encode real information (number things only if order matters); spend
boldness in exactly one place; treat copy as design material; remove one accessory before you finish.

## The standard (picked 2026-11-16; `docs/DESIGN-theming.md` §8, Desk card `ui-standard`)

**Values come from `web/app/tokens.css` (`--wp-*`) and `web/components/ui`, never from this file.** A hex table used
to live here and went stale; read the token file instead. No new hex, no new `text-[Npx]`.

- **Type.** Website text is sans with `font-variant-numeric: tabular-nums` on every number (voice B). Overlays stay
  monospace until one is tested in a raid. Scale 11 / 13 / 15 / 20 (phone) – 24 (desktop); nothing under 11px.
- **Spacing** 4 / 8 / 12 / 16 / 24 / 32. **Radius** 4 controls, 8 panels, 999 pills.
- **Colour carries meaning only.** One accent (`--wp-accent`) for the primary action and current nav; green = good or
  kill, red = bad or dead, gold = partial or DKP, orange = warning. Partial progress is never drawn like zero.
- **Grey text meets WCAG AA (≥ 4.5:1)** on the background it sits on. Production's `--wp-dim` is 3.8:1 on a panel;
  the beta standard raises it to 6.8:1. Do not put text a reader needs in a colour fainter than that.
- **One page header** (eyebrow, title, one line, actions) under the site header; one card; one table (11px uppercase
  headers, 13px cells, numbers right-aligned); three buttons (primary, default, ghost; 44px tall on a phone).
- **Layout differs by device, not by page.** Desktop: list + detail panes (D2), real tables. Phone: pill row, tables
  as stacked cards, full-width primary button. Check 390px and 1280px.
- **One of each thing.** Before adding a page, tab or component, check nothing already does the job. Use the shared
  part, never a lookalike.

## Generic tells to catch in review

These are the defaults a page falls into when nobody decided. Fix them unless the standard above asks for one.

- **The SaaS card kit:** identical rounded cards in a grid, one soft shadow on everything, gradient washes, a big
  number with a small label and a gradient accent as the hero. (Our "strip of big numbers" is fine; the decoration is
  not.)
- **Template chrome:** a single word accented in a headline, labels above content that say nothing, `→` appended to
  every link, a fade-and-slide entrance on every section, hover lift on every card. Motion answers a person's action;
  it does not decorate scrolling. (The standard's page-header eyebrow and uppercase table headers are deliberate.)
- **Wasted width:** a narrow column centred in a wide screen, or two navs that overlap.
- **Line length:** prose over ~80 characters a line is hard to read; constrain it with `ch`.

## Copy

Fewest words; if a control needs explaining, change the control. A button names its action ("Save changes", not
"Submit"), and the result uses the same verb ("Publish" → "Published"). Errors say what happened and what to do, never
just "Something went wrong", and never apologise. An empty state says what will appear and how to get it. Sentence
case. Loading text ends with `…`, the single character.

## Web hygiene (checked by grep, cheap to keep)

- Never a bare `outline-none`: give the control a visible `focus-visible` state (the global ring in `globals.css`
  already does this unless something removes it).
- No `transition-all` / `transition: all`; name the properties.
- Pin the locale in number and date formatting (`toLocaleString('en-US')`, `Intl.*('en-US')`): an unpinned one
  renders differently on the server and in the browser.
- Filters, tabs that should be shareable, and sort order live in the address (`searchParams`).
- `prefers-reduced-motion` respected; icon-only buttons have an `aria-label`; clickable things are `<button>` or `<a>`.

## Mocks, samples and demos

Samples use real data or real mechanics (no boss killed three days running). Spend real words only where the story
is, usually 3 to 7 strings; the rest can be neutral bars. Give an animated demo one still frame that tells the story,
for screenshots and reduced motion, and never catch it mid-change. Text never touches a neighbouring box: a fixed gap,
not leftover space.

## What generic design advice gets wrong about this repo

**The reader is mid-fight.** Overlays are read in peripheral vision while someone is tanking:

- **Motion is a cost, not a delight.** An animation that draws the eye steals attention from the game. The deliberate
  exception is the CH cast bar, which fills right-to-left because "it's confusing to see the countdowns going left to
  right on everything" (the guild lead, 2026-08-11): direction carrying meaning, not decoration.
- **Screen centre is sacred.** Callout chips grow upward from the bottom so they never creep into the middle of the
  screen (`docs/DESIGN-trigger-overlay-v2.md` §3b).
- **Density beats whitespace** on overlays. A raider needs eight rows visible, not four. When something truncates, say
  so: a card that silently showed 4 of 8 rolls looked complete and was not.
- **Colour is semantic, never decorative.** If a new element needs a colour, ask what it means first.

**Hard constraints that break the build if ignored:**

- **Mimic overlays:** every emitted `<details>` is built with `wpKeep(...)`; section HTML is byte-stable across polls.
  A new overlay owes the full feature-parity checklist in `CLAUDE.md` (✕ hide, ✥ move + right-click menu, the hover
  handshake on every clickable control, `WP_OVERLAY_ROWS`, `apply*Visibility()`, `_HIDEALL_FLAGS`, `_overlayEntries()`).
- **Agent dashboard:** edit `packages/wolfpack-logsync/dashboard.html`, never the `WEB_HTML` literal; run
  `npm run sync:dashboard` and `npm run check:dashboard`.
- **`command.html` is authoritative** and mirrored into the agent; re-sync with `node scripts/sync-command-embed.js`.
- **Never put `class="name"` on a cell whose text is not a character name:** the click delegation routes the first
  word to `/character/<token>`.

## Where the boldness has already been spent

- **ORDER CONFLICT** on the CH chain overlay: yellow on a red outline, because a doubled rotation kills the tank.
- **Caution-tape hatching** on the threat meter when melee should back off.
- **The monospace grid on overlays.**

## Before you finish

Screenshot before and after, at 390px and 1280px, and look at both: "done" is the rendered page meeting its
acceptance line, not green tests. Visible keyboard focus, reduced motion respected, then remove one accessory. If the
new thing is an overlay, re-read the parity checklist.
