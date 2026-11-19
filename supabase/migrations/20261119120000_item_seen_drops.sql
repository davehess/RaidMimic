-- item_seen_drops(p_item_id, p_item_name): where our raids have SEEN an item drop, for /db/item/[id].
-- Two bases, kept apart so the page never presents a guess as a fact:
--   'observed' = loot_observations rows that name the mob (source 'opendkp': an auction whose mob the
--                award carried). Direct.
--   'probable' = a raid-chat item link (the corpse's loot, linked as "A | B") within 45 s after a kill
--                ended, where that kill is the latest to end before the link and no other fight started
--                between the two. Time correlation only: one row per kill, counted once however many
--                raiders linked it.
-- in_published = the (npc, item) pair is in eqemu_npc_drops. No member or character name leaves here.
-- Service role only (the page reads it with the admin client).
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
    SELECT c.ts
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
      WHERE e2.ended_at <= l.ts AND e2.ended_at >= l.ts - interval '45 seconds' AND e2.npc_id IS NOT NULL
      ORDER BY e2.ended_at DESC LIMIT 1
    ) e ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM encounters e3
      WHERE e3.started_at > e.ended_at AND e3.started_at <= l.ts AND e3.id <> e.id
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
         EXISTS (SELECT 1 FROM eqemu_npc_drops d WHERE d.npc_id = a.npc_id AND d.item_id = p_item_id) AS in_published
  FROM allrows a
  LEFT JOIN eqemu_npc_types t ON t.id = a.npc_id
  ORDER BY a.last_seen DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.item_seen_drops(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_seen_drops(integer, text) TO service_role;
