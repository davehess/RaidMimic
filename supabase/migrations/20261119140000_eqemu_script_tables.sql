-- Script-driven game data the eqemu_* mirror cannot hold: what the server's quest scripts do on their own.
-- Source: data/quest-scripted.json (scripts/quest-scripted-extract.js over SecretsOTheP/quests), loaded weekly by
-- scripts/sync-script-tables.js, which replaces the rows of an older source_sha. Mirrors, not our own data:
-- readable by anon + authenticated like every Tier 1 table, written by service_role only.
-- Non-destructive: tables, indexes, policies. The sweep of older rows is run by the loader, not here.

-- Mobs a script spawns (eq.spawn2 / eq.unique_spawn). is_ref rows are LEADS only: an id written in a zone's
-- script that falls in the zone's npc range, with no spawn call resolved (no coordinates).
CREATE TABLE IF NOT EXISTS public.eqemu_script_spawns (
  row_key     text PRIMARY KEY,        -- md5 of the identifying fields; stable across weeks
  zone_short  text NOT NULL,
  npc_id      integer,                 -- null when the script picks the mob by a variable
  npc_name    text,
  x           numeric, y numeric, z numeric, heading numeric,
  loc_kind    text,                    -- fixed | at_existing_mob | computed
  api         text,                    -- spawn2 | unique_spawn
  script_ref  text NOT NULL,           -- '<zone>/<file>.lua:<line>'
  "trigger"   text,
  db_state    text,                    -- placed | no_spawn_rows | not_in_npc_types | ...
  is_ref      boolean NOT NULL DEFAULT false,
  source_sha  text NOT NULL
);
CREATE INDEX IF NOT EXISTS eqemu_script_spawns_npc_idx  ON public.eqemu_script_spawns (npc_id);
CREATE INDEX IF NOT EXISTS eqemu_script_spawns_zone_idx ON public.eqemu_script_spawns (zone_short);

-- Items a script puts on a mob (AddItem). npc_id is null when the script is zone-level.
CREATE TABLE IF NOT EXISTS public.eqemu_script_loot (
  row_key     text PRIMARY KEY,
  zone_short  text NOT NULL,
  npc_id      integer,
  item_id     integer NOT NULL,
  item_name   text,
  script_ref  text NOT NULL,
  how         text,
  source_sha  text NOT NULL
);
CREATE INDEX IF NOT EXISTS eqemu_script_loot_npc_idx  ON public.eqemu_script_loot (npc_id);
CREATE INDEX IF NOT EXISTS eqemu_script_loot_item_idx ON public.eqemu_script_loot (item_id);
CREATE INDEX IF NOT EXISTS eqemu_script_loot_zone_idx ON public.eqemu_script_loot (zone_short);

-- Quest turn-in rewards (QuestReward / SummonCursorItem), literal ids and amounts only. One row per reward call
-- and item (a call with no item, only exp or coin, is one row with item_id null). npc_id is set when the file is
-- named by id; otherwise npc_name is the script file's name and the page matches it to eqemu_npc_types.name in the
-- zone. gives_for = the item ids the nearest earlier check_turn_in in the same handler asked for: [{item_id, qty}].
CREATE TABLE IF NOT EXISTS public.eqemu_script_rewards (
  row_key     text PRIMARY KEY,
  zone_short  text NOT NULL,
  npc_id      integer,
  npc_name    text,
  kind        text NOT NULL,           -- reward | cursor
  item_id     integer,
  item_name   text,
  choice      boolean NOT NULL DEFAULT false,   -- one of several, picked at random
  exp         integer,
  coin        jsonb,                   -- {copper, silver, gold, platinum}, literal parts only
  gives_for   jsonb,
  script_ref  text NOT NULL,
  source_sha  text NOT NULL
);
CREATE INDEX IF NOT EXISTS eqemu_script_rewards_npc_idx  ON public.eqemu_script_rewards (npc_id);
CREATE INDEX IF NOT EXISTS eqemu_script_rewards_item_idx ON public.eqemu_script_rewards (item_id);
CREATE INDEX IF NOT EXISTS eqemu_script_rewards_zone_idx ON public.eqemu_script_rewards (zone_short, lower(npc_name));

ALTER TABLE public.eqemu_script_spawns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eqemu_script_loot    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eqemu_script_rewards ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eqemu_script_spawns', 'eqemu_script_loot', 'eqemu_script_rewards'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
    END IF;
  END LOOP;
END $$;
