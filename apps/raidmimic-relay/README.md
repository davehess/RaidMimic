# Raid Mimic party relay

A small Node 22 WebSocket service that lets the members of a group or raid share live overlay numbers. Everything is in memory;
nothing is written anywhere. Design, protocol, tiers and costs: [`docs/DESIGN-raidmimic-relay.md`](../../docs/DESIGN-raidmimic-relay.md).

- `index.js`: the HTTP + WebSocket glue.
- `lib.js`: validation, the tier rule, the per-player MAX merge, parties, the session cache (built-ins only; this is what the tests import).
- Test: `test/raidmimic-relay.test.js` at the repo root. Run `npm ci --prefix apps/raidmimic-relay` once, then `npx vitest run test/raidmimic-relay.test.js`.

## Run it

```
cd apps/raidmimic-relay
npm ci
SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_ANON_KEY=<anon key> PORT=8080 node index.js
```

| Variable | |
|---|---|
| `PORT` | listen port (Railway sets it) |
| `SUPABASE_URL` | the Supabase project that holds `mimic_sessions` |
| `SUPABASE_ANON_KEY` | the **anon** key. Never the service-role key: this service must not hold it |
| `RELAY_ALLOWED_ORIGINS` | optional, comma separated; a browser Origin outside the list is refused. Mimic sends no Origin |

Apply `supabase/migrations/20261115150000_raidmimic_relay.sql` first (the two RPCs and the entitlements table).

## Railway

A separate Railway project from the Wolf Pack bot, one service, **one replica** (a party lives in one process's memory).

| Setting | Value |
|---|---|
| Source | this GitHub repo |
| Root Directory | `/apps/raidmimic-relay` |
| Builder | Dockerfile, path `Dockerfile` (relative to the root directory) |
| Watch Paths | `/apps/raidmimic-relay/**` |
| Start command | none (the image's `CMD ["node", "index.js"]`) |
| Variables | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `RELAY_ALLOWED_ORIGINS` (`PORT` is injected) |
| Healthcheck path | `/health` (timeout 30 s) |
| Public networking | generate a domain; clients connect to `wss://<domain>/v1/party` |
| Restart policy | on failure |
