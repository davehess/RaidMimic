-- 20261115000000_combat_rollup_taken.sql
-- Keep each character's OWN incoming-combat numbers per fight, permanently.
--
-- Until now they lived only in contributions.raw_parse->defenders, which the midnight job nulls after 7 days.
-- encounter_combat_rollup already holds one row per (encounter_id, character_name) for the character's outgoing
-- damage; `taken` rides on the same row. The bot writes it from the uploader's OWN log only (the one defender row whose
-- name is the uploading character), so it is the character's complete incoming swing record, never a partial view of
-- somebody else's. A re-upload keeps the version with more total swings.
--
-- Idempotent: add column if not exists; the backfill touches only rows whose taken is null; functions are
-- create or replace; grants are re-runnable. Nothing is dropped.

alter table public.encounter_combat_rollup add column if not exists taken jsonb;

comment on column public.encounter_combat_rollup.taken is
  'The character''s own incoming swings for this fight, from their own log: hits, damageTaken, misses, dodges, parries, ripostes, blocks, invulns, rampageHits, rampageDmg (and maxHit when the agent sends it). Null when the character was not the uploader. Written by the bot only.';

-- ── One-shot backfill: the last 7 days of raw_parse still holds the defenders ───────────────────────────────────────
-- Only the contribution's own character (contributor_character) counts; if a character has several contributions for one
-- fight the one with the most total swings wins. Creates the rollup row when the character had no outgoing rollup.
insert into public.encounter_combat_rollup (guild_id, encounter_id, character_name, taken)
select distinct on (c.encounter_id, c.contributor_character)
       c.guild_id, c.encounter_id, c.contributor_character,
       jsonb_build_object(
         'hits',        coalesce((d.value ->> 'hits')::numeric, 0),
         'damageTaken', coalesce((d.value ->> 'damageTaken')::numeric, 0),
         'misses',      coalesce((d.value ->> 'misses')::numeric, 0),
         'dodges',      coalesce((d.value ->> 'dodges')::numeric, 0),
         'parries',     coalesce((d.value ->> 'parries')::numeric, 0),
         'ripostes',    coalesce((d.value ->> 'ripostes')::numeric, 0),
         'blocks',      coalesce((d.value ->> 'blocks')::numeric, 0),
         'invulns',     coalesce((d.value ->> 'invulns')::numeric, 0),
         'rampageHits', coalesce((d.value ->> 'rampageHits')::numeric, 0),
         'rampageDmg',  coalesce((d.value ->> 'rampageDmg')::numeric, 0))
from public.contributions c
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(c.raw_parse -> 'defenders') = 'array' then c.raw_parse -> 'defenders' else '[]'::jsonb end) as d(value)
where c.created_at >= now() - interval '7 days'
  and c.contributor_character is not null
  and c.encounter_id is not null
  and lower(d.value ->> 'name') = lower(c.contributor_character)
order by c.encounter_id, c.contributor_character,
         (coalesce((d.value ->> 'hits')::numeric, 0) + coalesce((d.value ->> 'misses')::numeric, 0)
          + coalesce((d.value ->> 'dodges')::numeric, 0) + coalesce((d.value ->> 'parries')::numeric, 0)
          + coalesce((d.value ->> 'ripostes')::numeric, 0) + coalesce((d.value ->> 'blocks')::numeric, 0)
          + coalesce((d.value ->> 'invulns')::numeric, 0)) desc
on conflict (encounter_id, character_name) do update
  set taken = excluded.taken
  where public.encounter_combat_rollup.taken is null;

-- ── Web read: a character's fights over time, as one jsonb value (cap-safe, see 20261004140600_cap_safe_me.sql) ─────
-- Newest 500 fights in the window, returned oldest first. Guild-scoped like the character reads: only rows whose guild
-- the caller belongs to (my_guild_ids). total_damage and dps are the character's own (encounter_players), falling back
-- to the rollup's outgoing total.
create or replace function public.character_combat_trends(p_name text, p_days int default 90)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with f as (
    select e.id as encounter_id, e.started_at, n.name as boss, e.duration_sec as duration,
           coalesce(ep.total_damage, r.total_damage, 0) as total_damage,
           coalesce(ep.dps, 0) as dps,
           r.by_skill, r.taken
    from encounter_combat_rollup r
    join encounters e on e.id = r.encounter_id
    left join eqemu_npc_types n on n.id = e.npc_id
    left join encounter_players ep on ep.encounter_id = r.encounter_id and ep.character_name = r.character_name
    where lower(r.character_name) = lower(p_name)
      and r.guild_id in (select public.my_guild_ids())
      and e.started_at >= now() - make_interval(days => greatest(coalesce(p_days, 90), 1))
    order by e.started_at desc, e.id
    limit 500
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'encounter_id', f.encounter_id,
           'started_at',   f.started_at,
           'boss',         f.boss,
           'duration',     f.duration,
           'total_damage', f.total_damage,
           'dps',          f.dps,
           'by_skill',     f.by_skill,
           'taken',        f.taken) order by f.started_at, f.encounter_id), '[]'::jsonb)
  from f
$$;

revoke all on function public.character_combat_trends(text, int) from public, anon;
grant execute on function public.character_combat_trends(text, int) to authenticated;
