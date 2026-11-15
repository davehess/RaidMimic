-- Durable import limit for raidmimic.com "My characters" (2026-11-15): one row per import (file or paste), so the cap of
-- 20 imports per player per hour holds across serverless instances. The web action counts the caller's rows from the last
-- hour (web/lib/hubImportLimit.ts) and fails OPEN if the count cannot be read; the in-memory limiter stays as the first
-- layer. Server-only: RLS on, no policies (the service role bypasses it).
-- RETENTION: nothing reads past 1 hour; the bot's midnight chain (index.js, "swept hub_import_attempts") deletes rows
-- older than 1 day.
create table if not exists hub_import_attempts (
  id        bigint generated always as identity primary key,
  player_id uuid not null,
  at        timestamptz not null default now()
);
create index if not exists hub_import_attempts_player_idx on hub_import_attempts (player_id, at);
alter table hub_import_attempts enable row level security;
