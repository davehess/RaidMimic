-- Three tables are in the wolfpack_replica publication (Tower's archive replication) but have no primary key, so their
-- default replica identity is empty and Postgres refuses every UPDATE or DELETE that touches a row ("cannot delete from
-- table ... because it does not have a replica identity and publishes deletes"). Found 2026-11-16 from the bot's midnight
-- sweep of hub_invite_attempts; the same rule made raidmimic.com's Remove-a-character and "Delete everything" fail
-- wherever they delete from hub_characters. REPLICA IDENTITY FULL sends the whole old row instead of a key.
-- Applied through the Supabase MCP 2026-11-16. Changes no data; idempotent.
alter table public.hub_characters replica identity full;
alter table public.hub_invite_attempts replica identity full;
alter table public.loot_observations_dedup_backup_20260816 replica identity full;
