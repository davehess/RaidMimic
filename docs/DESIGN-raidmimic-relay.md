# DESIGN — the Raid Mimic party relay (live party view)

*2026-11-15. Built (`apps/raidmimic-relay/`) and live. The Mimic / agent client is built on `beta` (agent 4.0.87): see "The Mimic client" below.*

## What it is

Members of a group or raid each run Mimic. Each agent already knows its own numbers (damage, healing, damage taken, threat,
roster HP, trigger fires). The relay lets them share those live: every agent publishes about every 2 seconds, and every member gets
back ONE merged view every 2 seconds. It is a small Node 22 WebSocket service that keeps everything in memory and writes nothing.

It is deliberately **not** part of the Wolf Pack bot:
- **Its own Railway project.** The bot is one replica holding raid memory and a Discord login (`CLAUDE.md`, "ONE bot replica");
  a relay that thousands of sockets hang off must be able to restart, scale and fail without touching either. A separate project
  also separates the bill: the relay's cost is what the live view costs, visible on its own.
- **No service-role key.** It holds the Supabase ANON key and nothing stronger. Two `SECURITY DEFINER` RPCs answer who a session
  token belongs to; a bug in the relay cannot read a table.
- **No history on disk.** A restart drops the parties and the clients reconnect and rejoin by code.

## Protocol

HTTP `GET /health` → `{ok, version, parties, clients}` (no secrets). WebSocket `/v1/party`, JSON text frames, 32 KB max.

| Direction | Message | Notes |
|---|---|---|
| client → | `hello {token, party?, create?, character, agent_version}` | first message, within 10 s. Exactly one of `party` (a 6-letter code) or `create:true`. `token` is the Mimic session token `wpms_` + 64 hex |
| ← server | `welcome {party, tier, member}` or `error {code}` then close | codes: `bad_hello` `bad_token` `bad_character` `bad_party` `unknown_session` `no_party` `party_full` `slow_down` `busy` `unavailable` `hello_timeout` `replaced` |
| client → | `pub {perPlayer?, target?, casting?, roster?, fires?, timers?}` | latest wins, no queue. `perPlayer: {Name: {dmg, heal, took, threat}}`; `timers` see Timers below |
| ← server | `view {party, tier, trial_ends_at, members, players, roster, fires, target?, casting?, timers, stale}` | every 2 s, the same view to every member; `players[i].age_ms` carries each stat's age |
| client → | `history {}` | ← `history {party, frames}`: the last 20 minutes of merged frames, one per 10 s (20 since 2026-11-15: "10 minutes is too short for charmers") |
| client → | `bye {}` | leave now |

Validation is strict and silent: a name is letters and apostrophes, at most 24; at most 80 rows; numbers finite and non-negative;
text at most 120 characters; the frame at most 32 KB. Any violation drops the whole frame, and the reply never repeats what was sent.
A client publishing faster than every 500 ms has the extra frames dropped.

## Timers (relay 1.1.0)

A shared stream of the buff, debuff and charm timers members cast, so the party sees one another's. Every tier gets it, free included (§588).

- **Frame:** `timers: [{kind: 'buff'|'debuff'|'charm', spell, target, caster, endsAt, may_break?}]`, at most 100 per frame. `spell` is plain
  text up to 60 characters; `target` is a mob or player name (letters, digits, space, apostrophe, backtick, hyphen, up to 64); `caster` is a
  name; `endsAt` is an absolute epoch in ms and must be in the future.
- **Own casts only:** `caster` must equal the publishing member's character from the hello. An observed timer of someone else is dropped.
- **Clamps:** buff and debuff `endsAt` is cut to now + 20 min; charm to now + 3 h (charms run to their own end; Tunare's Request is 3 h).
- **Per-item drops:** unlike rows, a bad timer drops only itself, not the frame (a snapshot of 100 timers is worth keeping for one bad entry).
- **Snapshot:** a frame with a `timers` list replaces that member's previous set (a timer it no longer lists is removed; `[]` clears).
  A frame with no `timers` field changes nothing.
- **Party map** keyed `kind|spell|target|caster`; expired entries are pruned on every view. A member leaving keeps its timers until `endsAt`.
- **View:** `timers: [{kind, spell, target, caster, endsAt, may_break}]` sorted by `endsAt`, at most 200. History does not carry timers.

## The merge

Per player, per stat: the **MAX** across the submitters, never the sum. Every raider's agent sees the same fight, so adding them would
multiply a number by the count of agents (`DESIGN-live-guild-dps.md`). Each stat carries the age of the frame that held the winning
value (the fresher one on a tie). A member's frame stops counting after 30 s. `stale` is true when the freshest sample is over 10 s old.
Roster HP and target/casting take the freshest submitter. Trigger fires are de-duplicated and the last 20 go out.

## Parties and tiers

`create:true` mints a 6-character code from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (the Mimic link code's alphabet: no 0 O 1 I L) and, for
a creator with no trial yet, starts their 14-day trial (`relay_start_trial`). A party dies 15 minutes after its last member leaves.

A player's tier (the SQL in `20261115150000_raidmimic_relay.sql`; the same rule is `playerTier` in `lib.js`):
- **pro**: a Wolf Pack member session, or a player with plan `pro`, or an active member of an unsuspended guild on plan `managed`;
- **trial**: `now() < trial_ends_at`;
- **free**: everything else. A guest link is always free.

A **party** is as good as its best member: one Pro member lifts everyone.

**Live merging is free for everyone (the guild lead, 2026-11-15, DECISIONS §588)**: *"same day overlay data merging is done on
the new bot, donation based up front. the hosted replays are the main point to charge for."* Every party gets 72 members, every
stream and the 20-minute history, whatever its tier. The tier is still resolved and sent in each view (it will matter for hosted
replays and a supporter tag); `LIVE_MERGE_FREE` in `lib.js` brings back the first draft's limits (free: 6 members, roster/HP
and trigger fires only) if that call is ever reversed. A party still starts its creator's one 14-day trial; that trial now
belongs to the hosted-replay plan, not to the relay.

## Operations

- Resolve results are cached 5 minutes (a miss 60 s); simultaneous lookups share one call; a failed lookup is never cached.
  More than 10 failed hellos a minute from one address closes the door on it (the address is the right-most `X-Forwarded-For`
  entry, the one Railway's proxy added).
- Heartbeat: ping every 30 s, a socket that did not answer the last one is dropped. permessage-deflate on. At most 2,000 clients
  per process (`busy` past that). SIGTERM tells every client `bye`, closes the sockets and exits.
- Logs are one JSON line per event: counts, party codes and the agent version. Never a token, a frame or a character name.
- Env: `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RELAY_ALLOWED_ORIGINS` (optional; Mimic sends no Origin and is always allowed).
- **One process.** Parties live in one process's memory, so scaling past one replica would split a party. Revisit (sticky routing by
  code, or a shared store) only if a single process cannot carry the sockets.

## Costs (estimates, unmeasured)

Egress dominates: a view for a 72-member party is a few KB, sent to 72 sockets every 2 seconds (compressed), so a full party is on the
order of 1-2 GB per raid night; a 6-member free party is a rounding error. CPU is one JSON stringify per party per tick.
- 1 party: cents a night.
- 10 parties: about $3-5 a month.
- 100 full parties: about $50-90 a month, mostly egress. That is why the full streams are a paid tier (`DESIGN-raidmimic-hosted.md` §8e:
  what costs us money is what we charge for).
- Supabase: one cached RPC per token per 5 minutes; negligible.

Measure the first real raid night (the `/health` counts plus Railway's metrics) and replace these numbers.

## The Mimic client (agent 4.0.87, 2026-11-15)

Built in `packages/wolfpack-logsync/index.js` (block "Raid Mimic party"), the DPS HUD (`apps/mimic/overlay.html`) and the dashboard
(`dashboard.html`). The relay is at `wss://raidmimic-relay-production.up.railway.app/v1/party` (`WOLFPACK_PARTY_RELAY_URL` overrides it).

- **WebSocket.** The agent is zero-dependency and runs under Electron's Node 20 (no global `WebSocket` without a flag), a member's own
  Node 18+ (`Parser.bat`) and Node 16 (the Windows 7 build), so it carries a small RFC 6455 client over `tls`/`net` rather than
  depending on a runtime that may not have one: the upgrade and its accept-key check, masked text frames out, text frames in
  (fragmented messages joined), ping answered with pong, close echoed, a 1 MB message cap, and permessage-deflate offered with
  `client_no_context_takeover; server_no_context_takeover` (each message inflates on its own; ⚠ a sync-flushed message needs
  `finishFlush: Z_SYNC_FLUSH`, without which zlib calls every compressed view truncated). The relay compresses views over 512 bytes, so a
  real party's view is always compressed.
- **Auth.** The Mimic session token (`wpms_` + 64 hex), the one already forwarded to the bot, not the shared agent token. No session:
  the card says to sign in and nothing connects.
- **What it sends** (`pub`, every 2 s while joined): `perPlayer` from the live (or just-ended, 2-minute) threat snapshot as `dmg`,
  `heal` (raw healing), `took`, `threat` (the weighted total); `target` and `casting` (the character's own target and its cast in
  flight); `roster` (the Zeal raid list, else the group bars) with HP %; `fires` (guild trigger fires of the last minute: a personal
  trigger's name stays on the PC). Nothing is sent unless there is a fight or a fresh roster. `partyBuildPub` is the one place frames
  are made: the relay drops a WHOLE frame for one bad name or number, so a pet's "a skeleton" leaves the map, numbers clamp to
  0..1e12, text is cut to 120 characters without control characters, rows are the 80 highest by damage, fires the newest 20, and the
  test runs the result through the relay's own `validatePub`.
- **Lifecycle.** `create` sends `create:true`; the welcome's code becomes the thing a reconnect JOINS, so a dropped socket can never
  mint a second party. Backoff 1, 2, 5, 10, 20, 30, 60 s (+ up to 20% jitter; `slow_down` waits at least 30 s) and resets on a welcome.
  `replaced`, `party_full`, `unknown_session`, `bad_token`, `bad_character`, `bad_party` and `no_party` end it with a plain message and
  no retry. A socket silent for 15 s (views arrive every 2 s) is dropped and rejoined. The code is kept 4 h in `logsync.party.json`
  so an agent restart rejoins; leaving or an ending error deletes it.
- **Stand-down** (the socket closes, the code stays, it resumes by itself): dry-run, no Mimic sign-in, `shouldUploadForCharacter`
  false (exclude_from_stats, a guest, another server), `_controlStandDown` (fleet kill switch, version floor).
- **Surfaces.** `GET /api/party` (status, code, members, tier, trial_ends_at, stale, error, and the merged `players` / `roster` /
  `fires` / `target` / `casting`), `POST /api/party {action: create|join|leave, code?}`, `partyView` on `/api/state`. Dashboard card on the
  Logsync tab; the tray's "Raid Mimic party…" and Settings' "Open the party card…" open it (tray ↔ dashboard parity); the tray shows the
  code and Leave while in a party. The DPS HUD's **Party** switch (shown only while a party exists) swaps the board's rows for the merged
  ones, DPS and Tank (Tank reads merged `took`), each with a freshness dot in three buckets so the rows stay byte-stable; with no party
  it is ignored and the board stays the machine's own. No new overlay window. The tier shows only as "Pro" or "Pro trial · N days left".
- **Not in the client yet:** the `history` request (hosted replays are the paid part), a trial-ending notice, and the party's target /
  casting / fires on the HUD (they are in `partyView` for the next overlay to use).

## Not built

The Railway project's own domain beyond the default, applying the migration if not yet applied, and a way for an operator to grant
`plan = 'pro'` (today: a service-role insert into `hub_player_entitlements`).
