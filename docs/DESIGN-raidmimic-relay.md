# DESIGN — the Raid Mimic party relay (live party view)

*2026-11-15. First draft, built (`apps/raidmimic-relay/`) and NOT deployed. The Mimic client is not written.*

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
| client → | `pub {perPlayer?, target?, casting?, roster?, fires?}` | latest wins, no queue. `perPlayer: {Name: {dmg, heal, took, threat}}` |
| ← server | `view {party, tier, trial_ends_at, members, players, roster, fires, target?, casting?, stale}` | every 2 s, the same view to every member; `players[i].age_ms` carries each stat's age |
| client → | `history {}` | ← `history {party, frames}`: the last 10 minutes of merged frames, one per 10 s. Paid parties only |
| client → | `bye {}` | leave now |

Validation is strict and silent: a name is letters and apostrophes, at most 24; at most 80 rows; numbers finite and non-negative;
text at most 120 characters; the frame at most 32 KB. Any violation drops the whole frame, and the reply never repeats what was sent.
A client publishing faster than every 500 ms has the extra frames dropped.

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

| | Free | Trial / Pro |
|---|---|---|
| Members | 6 | 72 |
| Streams | roster/HP and trigger fires | every stream (per-player numbers, target, casting) |
| History | no | last 10 minutes |

A Pro joiner can enter a full free party (the tier is judged with them in). If the Pro member then leaves, nobody is removed: the party
simply drops back to the free streams and takes no new members past 6. A trial that ends while a socket is open counts as free from
that moment. A guild or plan change takes effect at the next reconnect or after the 5-minute resolve cache.

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

## Not built

The Mimic side (the overlay, the Settings card that creates and joins a party, the reconnect loop), the Railway project and its
domain, applying the migration, and a way for an operator to grant `plan = 'pro'` (today: a service-role insert into
`hub_player_entitlements`).
