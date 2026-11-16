# Design mocks of 2026-11-16 (draft, not for main)

Static mock pages and screenshots behind the Decision Desk card `ui-standard`, kept here because the session that made
them worked in a scratchpad the next session cannot see. See `docs/HANDOFF-2026-11-16-design.md` on main.

- `round1/`: one standard, three font voices (a = monospace, b = sans with tabular numbers, c = serif titles), a fake
  "PoP flags" page with invented characters, at 1280 and 390. `gen.js` writes the pages and screenshots (its `OUT`
  path is the old scratchpad: change it before running).
- `round2/`: after the outside design review: voice b, one nav, gold = partial, a progress bar, the selected row
  highlighted, AA contrast; three layouts d1 (dense table + inline detail), d2 (two panes, recommended), d3 (PoP tier
  ladder). `d-390.png` puts the three phone versions side by side.
- `shots/`: the real beta pages in the preview: `/design` in each voice, `/privacy` today vs voice b, the header at 1440
  (after scroll, Download menu open) and 390. `shot-ds2.js` / `shot-hdr.js` drive a local `next dev` (see the handoff).
- `research/poair-rings.md`: the Plane of Air ring notes from the quest scripts (pinned commit 60e979f).
