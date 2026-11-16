-- "Delete everything" reaches the archive too (the guild lead, 2026-11-15, Desk: "A, close them"; DECISIONS §593).
--
-- The nightly archive (scripts/lib/archive-merge.sql) never deletes rows from its ARCHIVE tables, because a row missing
-- from production usually means "aged out", not "deleted". So a person's own rows that member_self_delete removes from
-- page_views, tells, trigger_timing_feedback and raid_roster survived in the archive. member_self_delete now writes the
-- two ids it deleted by here, and the archive merge deletes those rows from its own copy the next night.
--
-- Only the ids: the login id (a random uuid) and the Discord id the rows were keyed on, so the archive can find them.
-- Nothing else. Kept 30 days (the bot's midnight sweep), the same as the nightly backups, then gone.
-- Service role only: RLS on, no policies. Idempotent.

create table if not exists public.self_delete_forget (
  user_id      uuid        primary key,
  discord_id   text        not null,
  forgotten_at timestamptz not null default now()
);

alter table public.self_delete_forget enable row level security;
revoke all on public.self_delete_forget from anon, authenticated;

comment on table public.self_delete_forget is
  'Ids of people who used "Delete everything", so the archive merge removes their rows from its own copy. Kept 30 days. Service role only.';
