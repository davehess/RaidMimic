-- 20261115010000_combat_rollup_weave.sql
-- The uploader's own per-fight weave tally (agent 4.0.86+): {rounds, roundsWithSpecial, specials, avgRoundGapMs,
-- lateRounds}. Written by upsertCombatRollup in a write of its own, so another uploader's copy of the fight never
-- blanks it. character_combat_trends returns it beside by_skill and taken. Idempotent.

alter table public.encounter_combat_rollup add column if not exists weave jsonb;

comment on column public.encounter_combat_rollup.weave is
  'The character''s own weave tally for this fight, from their own log (agent 4.0.86+): rounds, roundsWithSpecial, specials, avgRoundGapMs, lateRounds. Null for older agents and for characters who were not the uploader.';

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
           r.by_skill, r.taken, r.weave
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
           'taken',        f.taken,
           'weave',        f.weave) order by f.started_at, f.encounter_id), '[]'::jsonb)
  from f
$$;

revoke all on function public.character_combat_trends(text, int) from public, anon;
grant execute on function public.character_combat_trends(text, int) to authenticated;
