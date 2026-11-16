# Theming: one token set, a guild theme on top, a raider's look on top of that

**Status: designed 2026-10-31, first drafts in progress.** The guild lead: *"we need to really cleanup the UI … theming is very
important to guilds and it should be a part of our designer as well"*; pick **C** (DECISIONS §488) over daisyUI on the site (A)
or daisyUI everywhere (B). "Our designer" means every surface a raider or officer styles things on: the Canvas builder, UI
Studio, the Overlays tab, the website and the Mimic/dashboard colour scheme.

## 1. Why not a library
daisyUI 5 is built on Tailwind 4 (we are on 3.4.10; daisyUI 4 is the frozen Tailwind-3 line). Its twelve colour roles do not
hold ours: no `gold`, no `dim`, no `border` role, and its `accent` collides with our `accent` by name. Its components bring
rounded corners, padding and transitions that the frontend-design skill rules out for overlays read mid-raid. What it offers
that we lack, a theme as a set of CSS variables under `data-theme`, costs nothing to build ourselves, and the hex values are
already identical across the three surfaces (the skill calls that "a real asset"). So: no new dependency, no Tailwind 4
migration; daisyUI's 35 palettes may be imported later as starting presets (a one-time mapping script).

## 2. The token set
One file, `tokens.css`, the same names on every surface, seeded with today's values so nothing changes on day one:

| Slot | Today | Themable by a guild? |
|---|---|---|
| `--wp-bg` | #0d1117 | yes |
| `--wp-panel` | #161b22 | yes |
| `--wp-border` | #30363d | yes |
| `--wp-text` | #c9d1d9 | yes |
| `--wp-dim` | #6e7681 | yes |
| `--wp-accent` (buttons, links, the brand colour) | #1f6feb | yes |
| `--wp-blue` / `--wp-purple` | #58a6ff / #a371f7 | yes |
| `--wp-green` (good, kill) · `--wp-red` (bad, dead, HP) · `--wp-gold` (DKP, top, warning) · `--wp-orange` | #56d364 · #f85149 · #d29922 · #ffa657 | **no**: meanings, fixed |
| `--wp-font-mono` / `--wp-font-ui` | ui-monospace / system | pick from a short list |
| `--wp-radius` | 6px | yes (4–10px) |
| `--wp-logo` | /wolf.png | yes (URL) |
| `--wp-embed` (Discord embed colour for neutral cards) | 0x5865F2 | yes |

Where it lives per surface: the site (`web/app/tokens.css`, Tailwind colours mapped to `rgb(var(--wp-…) / <alpha-value>)`,
`globals.css` off its hard-coded hex, `<html data-theme="guild">`), the overlays (`apps/mimic/theme.css` loaded by every
overlay window; the 27 files move off raw hex to `var(--wp-…)`; `parts.js`'s colour map reads the same variables), the
dashboard (`dashboard.html`'s `:root`, same names, synced into `WEB_HTML` as always). A ratchet test counts raw hex outside
`tokens.css`/`theme.css` and may only shrink.

## 3. Layering
Built-in defaults → **guild theme** → the raider's own look (`cfg.overlayTheme` filters, colour-blind modes, per-overlay
opacity and backdrop, which overlay sets already save) → per-piece colour in the Canvas. Each layer is a CSS-variable
override on the layer below; nothing rewrites markup. A character's last layout (§468) and named sets keep working because
they store the raider's layer, not the guild's.

## 4. The guild theme
`guild_theme (guild_id primary key, slots jsonb, logo_url, font, embed_color, updated_at)`: one row per guild, officer-edited,
seeded with the defaults. Served: the site reads it in `layout.tsx` and emits the variables on `<html>`; Mimic receives it in
the link-flow identity payload (the bot's `mimic_session` reply) and caches it under `userData/brand/`, with `preload.js`
injecting it as a `wp-theme-guild` body class beside the existing theme filters; the bot's `embedColor()` applies it to the
neutral embeds only (blurple/default), never to the semantic ones. The guild-scope ratchet needs `guild_theme` in
`scripts/guild-tables.json`. The self-host kit's `guild/config.json` gets a `theme` key that the docs already promised and
nothing reads (the §3/§7b claim in `DESIGN-guild-kit.md` is corrected by this file).

## 5. The designer
One theme editor, reached from every surface: an officer page on the site (`/admin/theme`: the slots with a live preview of a
fight card, an overlay row and a Discord card), and in Mimic a read-only "Guild palette" strip in the Canvas colour picker,
the Overlays tab's look section and UI Studio's chrome, each with "your own on top" controls that write the raider's layer.
UI Studio's EverQuest UI packs are a different thing (the game's own files) and are not themed here.

## 6. The feedback loop
Google's Chrome DevTools MCP (Apache-2.0) attaches to a Chromium debug port and gives a session screenshots, computed styles,
the accessibility tree, console and input. In the cloud it attaches to the stand-in overlay server (`scripts/raidmimic-shots/
shoot.mjs`) and the Next dev server; on the guild lead's PC it attaches to the real Mimic launched with
`--remote-debugging-port=9222` (not wired yet; a `--devtools` flag in `main.js` would add it). The sweep runs component by
component with that loop: screenshot, change, screenshot. Adding the server to the repo's `.mcp.json` is the guild lead's call.

## 7. Order of work
1. `tokens.css` + the site's variable layer, visually identical (web, on beta).
2. `apps/mimic/theme.css` + the 27 overlays off raw hex + `parts.js` (Mimic, beta).
3. The dashboard's `:root` on the same names (agent, beta).
4. The ratchet test.
5. `guild_theme` + the bot's identity payload + `embedColor()` + `/admin/theme`.
6. The designer strips in the Canvas, Overlays tab and UI Studio.
7. The component sweep with the DevTools loop, surface by surface, each round as a beta preview.

## 8. Uniformity audit and the one standard (2026-11-16)

The guild lead: *"too many pages use different fonts, layouts, etc. There's no uniformity. It should be the same, fit into the
same crisp package, work on both mobile and desktop, but with different layouts."* Measured on main/beta the same day (grep
counts, so floors):

| Surface | What is shared | What is not |
|---|---|---|
| wolfpack.quest + raidmimic.com (`web/`) | colours via `tokens.css`; mono body everywhere | no page shell or title component (156 pages roll their own; ≥12 root-wrapper patterns); titles h1 on 55 pages, h2 on 69, sizes xl/2xl/3xl, colours gold/text/bone/white/orange; content width max-w-2xl…7xl plus `ch` measures, 85 pages none; 239 distinct card strings; 58 button strings + raidmimic's own `BTN`; 30 table styles, 19 files with a table and no scroll wrapper (mostly `/admin`); 1,176 arbitrary `text-[Npx]` (9/10/11/13px); 460 arbitrary colour classes (`#f2ede1` bone ×95, `#21262d` ×36 unnamed); Prata/Faustina serif only on `/`, `/start`, `/about`, `/zeal-icons`; three different headers and frames |
| Mimic local site (`web/local`) | Tailwind config spreads the web one | did not load `tokens.css` until agent 4.0.96 (every themed colour and the font had no value) |
| Dashboard (`dashboard.html`) | `body` reads `--wp-font-mono` | 1,408 inline `style=`; legacy aliases (`--border`, `--text`…) used ~5× more than `--wp-*`; `--fg`, `--muted`, `--card` used but never defined; 456 raw hex; 14 font sizes; ~12 button looks; 11 radii, `--wp-radius` unused; 76 padding values; `.grid` minmax(380px) overflows a 375px phone |
| Mimic windows + overlays (`apps/mimic`) | 25 of 27 link `theme.css` | `--wp-font-*` used once, `--wp-radius` never; UI Studio is sans, the rest mono; window background `#0e1116` and border `#2a3140` copied by hand (not the tokens); 4 greys for muted text; 5 button systems; overlay title colours picked per file with no meaning; `command.html` links nothing |

**The standard** (the same in every direction offered): type scale 11 / 13 / 15 / 20 (phone) – 24 (desktop); spacing
4/8/12/16/24/32; radius 4 (controls), 8 (panels), 999 (pills); two new tokens `--wp-raised #21262d` and `--wp-bone #f2ede1`;
one page header (eyebrow, title, one line, actions) under a site header that carries the **Mimic logo**
(`web/public/mimic-logo.png`, the raidmimic.com header's; the guild lead, 2026-11-16: "Should be using the mimic logo
though"); one card, one table (11px uppercase headers, 13px cells, tabular
numbers right-aligned), three buttons (primary, default, ghost; 44px tap height on a phone). Layout differs by device: a side
rail and real tables on desktop; a pill row, tables as stacked cards and full-width primary buttons on a phone. Overlays keep
their mid-raid density but take the same font and tokens. Samples were rendered from a static mock (not committed).

**Round 2, after a second-opinion design review (2026-11-16).** The review found the font was not the main problem: wasted
width, partial progress drawn like zero, cards labelled for one character but listing another, a cramped two-column "Can
enter", two navs that overlap, too many accents, and grey text below WCAG AA. Every round-2 layout therefore has: sans text
with `font-variant-numeric: tabular-nums` for numbers (voice B, now the recommendation; monospace stays in overlays until one
is tested in a raid); one nav (the top bar); one accent (`--wp-accent`) plus status colours, with **gold = partial** and zero
faint; a progress bar on the flag count; level as its own sortable column; the selected row highlighted and every card about
that row only; "Can enter" as one column of ✓/✗ with the requirement only when missing; secondary text at ≥ 4.5:1 (e.g.
`#9aa4ad` on the panel, 6.8:1). **Open (Desk card `ui-standard`): the layout pattern**: D1 dense table with inline detail,
D2 two panes (list + always-open detail; recommended, since it fits every list page), D3 PoP tier ladder (recommended as a tab
inside D2's detail), plus follow-ups on the voice, overlays, zero-cell contrast, the landing serif, phone tables and order.
