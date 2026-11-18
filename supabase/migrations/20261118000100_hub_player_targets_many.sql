-- "Tonight's raid" on raidmimic.com /raids may name several zones and bosses (DECISIONS §629 item 6). They are stored as one
-- comma-separated list in target_key (web/lib/raidTargets.ts validates every key against the catalog before a save), so the
-- column's 40-character limit is lifted to 400. Idempotent; the primary key (player_guild_id, raid_date) is unchanged.
alter table public.hub_player_targets drop constraint if exists hub_player_targets_target_key_check;
alter table public.hub_player_targets
  add constraint hub_player_targets_target_key_check check (char_length(target_key) between 1 and 400);
