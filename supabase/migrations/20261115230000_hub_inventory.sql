-- Raid Mimic "character page" (2026-11-15): a player who is not a Wolf Pack member uploads a character's Zeal
-- `<Name>-Inventory.txt` (/output inventory) or a `<Name>Quarmy.txt` export on raidmimic.com/characters/<name>, and the
-- page shows the gear and bags. One row per (player, character, source, slot).
--
-- Person table, no guild_id, like hub_characters / hub_flags (20261102210000_hub_sync.sql). Written and read ONLY through
-- the service role: RLS is ON with NO policies and anon/authenticated hold no grants. Every read and write in
-- web/lib/hubInventory.ts + web/app/characters is keyed on player_id, so two players who hold the same character name
-- never see or touch each other's rows (the unique key leads with player_id).
--   source 'inventory' = Zeal /output inventory (worn, bags, bank, shared bank); 'quarmy' = the Quarmy export (worn + bags
--   only: the web parser drops bank, coin and the cursor slot, as the agent's does).
-- RETENTION: current state only. An upload upserts its rows, then deletes that (player, character, source) set's rows of
-- an older observed_at, so a re-upload replaces the previous one. The character's Remove button deletes them too.
-- member_self_delete does NOT yet cover this table: see the separate migration 20261115230100_self_delete_hub_inventory.sql.
-- Idempotent: applying it twice is harmless.

create table if not exists public.hub_inventory (
  id          bigint generated always as identity primary key,
  player_id   uuid        not null references public.hub_players (player_id) on delete cascade,
  character   text        not null,
  name_lc     text        not null,
  source      text        not null check (source in ('inventory', 'quarmy')),
  slot_label  text        not null check (char_length(slot_label) between 1 and 64),
  item_id     integer     null,
  item_name   text        not null check (char_length(item_name) between 1 and 128),
  quantity    integer     not null default 1 check (quantity between 1 and 1000000),
  observed_at timestamptz not null,
  unique (player_id, name_lc, source, slot_label)
);

-- No separate (player_id, name_lc) index: the unique key above leads with those two columns and serves those reads.

alter table public.hub_inventory enable row level security;
revoke all on public.hub_inventory from anon, authenticated;

-- Which (player, character, source) sets exist, for the /characters card's "gear loaded" line: one row per set instead of
-- one per slot (web/lib/hubInventoryDb.ts sourcesByCharacter). security_invoker so it can never read past the table's own
-- rules; service role only, like the table.
create or replace view public.hub_inventory_sources with (security_invoker = true) as
  select distinct player_id, name_lc, source from public.hub_inventory;
revoke all on public.hub_inventory_sources from anon, authenticated;

comment on table public.hub_inventory is
  'Items a hub player''s character holds, from an uploaded Zeal inventory or Quarmy file (web/lib/hubInventory.ts). Person-scoped, no guild_id. Service role only: RLS on, no policies.';
