---
name: react-next-rules
description: Performance rules for the Next.js site in web/ (server pages, data fetching, bundle size, hydration). Use when writing or reviewing a page, server action, route handler or client component under web/, especially one that reads Supabase or feels slow to load.
---

# React / Next.js performance rules for `web/`

A pinned, trimmed copy of Vercel's `react-best-practices` skill (github.com/vercel-labs/agent-skills, commit
`1a2c79d4`, 2026-10-27, MIT; see `LICENSE`). The guild lead picked "a trimmed, pinned copy" on the Decision Desk,
2026-11-17 (DECISIONS §606). The rule files in `rules/` are Vercel's, unedited; this page says which apply here and how.

**Precedence:** `CLAUDE.md` first, then `.claude/skills/frontend-design`, then these. They never fetch anything; to
update, copy newer files from the upstream repo on purpose and change the commit above.

## Why these 20 and not the other 50

Our slow paths are server pages that wait on several Supabase reads in a row (the `/parses` and `/me` skeletons, design
review item 10), and reads are what Supabase bills (egress, `CLAUDE.md` → Supabase). So the copy keeps:

- **`async-*` and `server-*`:** start independent reads together (`Promise.all`), do not let a child component's fetch
  wait for its parent's, dedupe a read used twice in one request (`React.cache`), send a client component only the
  fields it renders, and check auth inside every server action.
- **`bundle-*`:** no barrel imports, load heavy client pieces (three.js, the map, charts) only where they show.
- **`rendering-hydration-*`:** dates and anything browser-only without a flash or a hydration warning.

Left out: client micro-optimisations (`js-*`, most `rerender-*`), which are noise at our scale, and anything needing
a library we do not use.

## Our versions (check before applying a rule)

`web/` runs **Next.js 14.2 and React 18.3**. So:
- `use(promise)` in `async-suspense-boundaries.md` is React 19; in our app pass the awaited data down, or keep the
  Suspense boundary and await inside the async server component.
- `after()` (Next 15) is not available; its rule was dropped from this copy.

## Rules

| File | One line |
|---|---|
| `rules/async-parallel.md` | `Promise.all()` for independent reads |
| `rules/async-dependencies.md` | start each read as soon as its inputs exist |
| `rules/async-defer-await.md` | await where the value is used, not at the top |
| `rules/async-cheap-condition-before-await.md` | check the cheap condition before an async one |
| `rules/async-api-routes.md` | no waterfalls in route handlers |
| `rules/async-suspense-boundaries.md` | stream the slow part behind its own Suspense |
| `rules/server-parallel-fetching.md` | sibling server components fetch in parallel |
| `rules/server-parallel-nested-fetching.md` | nested fetches without a waterfall |
| `rules/server-cache-react.md` | `React.cache()` dedupes a read within one request |
| `rules/server-serialization.md` | pass client components only what they render |
| `rules/server-dedup-props.md` | do not serialise the same data twice |
| `rules/server-hoist-static-io.md` | read static files once per module, not per request |
| `rules/server-no-shared-module-state.md` | never keep request data in module scope |
| `rules/server-auth-actions.md` | authenticate every server action |
| `rules/bundle-barrel-imports.md` | import from the file, not an index |
| `rules/bundle-dynamic-imports.md` | `next/dynamic` for heavy components |
| `rules/bundle-conditional.md` | load a module only when its feature is on |
| `rules/bundle-defer-third-party.md` | load third-party scripts after the page |
| `rules/rendering-hydration-no-flicker.md` | browser-only values without a flash |
| `rules/rendering-hydration-suppress-warning.md` | when `suppressHydrationWarning` is right |
