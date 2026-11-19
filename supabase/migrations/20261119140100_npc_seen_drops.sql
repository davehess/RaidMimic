-- npc_seen_drops(p_npc_id): the items our raids have SEEN drop from one mob, for /db/npc/[id].
-- Same two bases and the same guild-pairing rule as item_seen_drops, kept apart so a guess is never shown as fact:
--   'observed' = loot_observations rows that name the mob (an auction whose mob the award carried).
--   'probable' = raid-chat item names (a corpse's loot linked as "A | B") within 45 s after a kill of this mob ended,
--                where that kill is the latest to end before the message and no other fight started between the two.
--                One count per kill and item, however many raiders linked it. Each name is matched to eqemu_items by
--                exact name (when two items share a name, the one this mob's table carries wins, then the lowest id).
-- in_published = the (npc, item) pair is in eqemu_npc_drops OR eqemu_script_loot (the page's "not in DB" tag).
-- No member or character name leaves here. Service role only (the page reads it with the admin client).
CREATE OR REPLACE FUNCTION public.npc_seen_drops(p_npc_id integer)
RETURNS TABLE (item_id integer, item_name text, basis text, times_seen integer, last_seen timestamptz, in_published boolean)
LANGUAGE sql STABLE
SET statement_timeout = '8s'
AS $$
  WITH obs AS (
    SELECT lo.item_id::integer AS item_id, 'observed'::text AS basis,
           count(DISTINCT coalesce(lo.raid_id::text, lo.posted_at::text))::integer AS times_seen,
           max(lo.posted_at) AS last_seen
    FROM loot_observations lo
    WHERE lo.npc_id = p_npc_id
    GROUP BY lo.item_id
  ),
  kills AS (
    SELECT e.id, e.guild_id, e.ended_at
    FROM encounters e
    WHERE e.npc_id = p_npc_id AND e.ended_at IS NOT NULL
  ),
  links AS (
    SELECT k.id AS kill_id, k.ended_at, c.ts,
           btrim(piece) AS piece
    FROM kills k
    JOIN chat_messages c
      ON c.channel = 'raid' AND c.guild_id = k.guild_id
     AND c.ts >= k.ended_at AND c.ts <= k.ended_at + interval '45 seconds'
    CROSS JOIN LATERAL unnest(string_to_array(btrim(c.text), ' | ')) AS piece
    WHERE NOT EXISTS (
      SELECT 1 FROM encounters e3
      WHERE e3.guild_id = k.guild_id AND e3.id <> k.id
        AND ((e3.ended_at > k.ended_at AND e3.ended_at <= c.ts)
          OR (e3.started_at > k.ended_at AND e3.started_at <= c.ts))
    )
  ),
  named AS (
    SELECT DISTINCT ON (l.kill_id, l.piece) l.kill_id, l.ended_at, i.id AS item_id
    FROM links l
    JOIN eqemu_items i ON i.name = l.piece
    ORDER BY l.kill_id, l.piece,
             (EXISTS (SELECT 1 FROM eqemu_npc_drops d WHERE d.npc_id = p_npc_id AND d.item_id = i.id)) DESC, i.id
  ),
  prob AS (
    SELECT n.item_id::integer AS item_id, 'probable'::text AS basis,
           count(DISTINCT n.kill_id)::integer AS times_seen, max(n.ended_at) AS last_seen
    FROM named n
    GROUP BY n.item_id
  ),
  allrows AS (SELECT * FROM obs UNION ALL SELECT * FROM prob)
  SELECT a.item_id, coalesce(it.name, '') AS item_name, a.basis, a.times_seen, a.last_seen,
         (EXISTS (SELECT 1 FROM eqemu_npc_drops d WHERE d.npc_id = p_npc_id AND d.item_id = a.item_id)
          OR EXISTS (SELECT 1 FROM eqemu_script_loot sl WHERE sl.npc_id = p_npc_id AND sl.item_id = a.item_id)) AS in_published
  FROM allrows a
  LEFT JOIN eqemu_items it ON it.id = a.item_id
  ORDER BY a.last_seen DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.npc_seen_drops(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.npc_seen_drops(integer) TO service_role;

-- item_seen_drops, same body as 20261119120000 with one change: a pair that eqemu_script_loot lists counts as
-- "in DB" too (in_published), so the item page's "not in DB" tag does not fire on an item a script hands out.
CREATE OR REPLACE FUNCTION public.item_seen_drops(p_item_id integer, p_item_name text)
RETURNS TABLE (npc_id integer, npc_name text, basis text, times_seen integer, last_seen timestamptz, in_published boolean)
LANGUAGE sql STABLE
SET statement_timeout = '8s'
AS $$
  WITH obs AS (
    SELECT lo.npc_id::integer AS npc_id, 'observed'::text AS basis,
           count(DISTINCT coalesce(lo.raid_id::text, lo.posted_at::text))::integer AS times_seen,
           max(lo.posted_at) AS last_seen
    FROM loot_observations lo
    WHERE lo.item_id = p_item_id AND lo.npc_id IS NOT NULL
    GROUP BY lo.npc_id
  ),
  links AS (
    SELECT c.ts, c.guild_id
    FROM chat_messages c
    WHERE c.channel = 'raid'
      AND p_item_name IS NOT NULL AND length(p_item_name) > 0
      AND c.text LIKE '%' || p_item_name || '%'
      AND p_item_name = ANY (string_to_array(btrim(c.text), ' | '))
  ),
  kills AS (
    SELECT DISTINCT ON (e.id) e.id, e.npc_id, e.ended_at
    FROM links l
    JOIN LATERAL (
      SELECT e2.id, e2.npc_id, e2.ended_at
      FROM encounters e2
      WHERE e2.guild_id = l.guild_id
        AND e2.ended_at <= l.ts AND e2.ended_at >= l.ts - interval '45 seconds' AND e2.npc_id IS NOT NULL
      ORDER BY e2.ended_at DESC LIMIT 1
    ) e ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM encounters e3
      WHERE e3.guild_id = l.guild_id
        AND e3.started_at > e.ended_at AND e3.started_at <= l.ts AND e3.id <> e.id
    )
  ),
  prob AS (
    SELECT k.npc_id::integer AS npc_id, 'probable'::text AS basis,
           count(*)::integer AS times_seen, max(k.ended_at) AS last_seen
    FROM kills k
    GROUP BY k.npc_id
  ),
  allrows AS (SELECT * FROM obs UNION ALL SELECT * FROM prob)
  SELECT a.npc_id,
         replace(coalesce(t.name, ''), '_', ' ') AS npc_name,
         a.basis, a.times_seen, a.last_seen,
         (EXISTS (SELECT 1 FROM eqemu_npc_drops d WHERE d.npc_id = a.npc_id AND d.item_id = p_item_id)
          OR EXISTS (SELECT 1 FROM eqemu_script_loot sl WHERE sl.npc_id = a.npc_id AND sl.item_id = p_item_id)) AS in_published
  FROM allrows a
  LEFT JOIN eqemu_npc_types t ON t.id = a.npc_id
  ORDER BY a.last_seen DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.item_seen_drops(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_seen_drops(integer, text) TO service_role;
