-- 20261115170000_item_duration_focus.sql
-- Items whose FOCUS effect lengthens buffs (SE_IncreaseSpellDuration, SPA 128), with the limits the server checks (the guild
-- lead, 2026-11-15: "we can't give accurate accounting of timers without AAs and item focus effects").
--
-- Client::ApplyDurationFocus (SecretsOTheP/EQMacEmu c2cd265 zone/spell_effects.cpp:4630-4662) multiplies a landed buff's
-- remaining ticks by (100 + focus) / 100, where the focus is the best single worn item's SPA 128 value that passes
-- Mob::CalcFocusEffect (spell_effects.cpp:4080-4408): SE_LimitMaxLevel 134 (the cast spell's level for the caster's class must
-- not exceed base, spell_effects.cpp:4121-4135), SE_LimitSpellType 138 (spell.goodEffect must equal base: 1 beneficial only,
-- 0 detrimental only, :4264-4266), SE_LimitMinDur 140 (the spell's formula duration at the caster's level must be at least
-- base ticks, :4165-4170). Slots are read by effect id, not position: 3106 / 3843-3846 order them differently from 2217-2219.
-- SE_LimitTarget 137 on these spells only EXCLUDES target types 101, 22 (unused) and 40 (AE bard), and bard songs get no focus
-- at all (Client::GetFocusEffect, :4433), so it is not carried. base2 of slot 134 (the per-level reduction over the cap) is not
-- in the mirror; the server returns 0 when it is 0, which is what the agent assumes.
-- Served to agents on the item-clickies payload as `duration_foci`. Tier 1 catalog data: readable like the eqemu_* tables.
-- Idempotent.

create or replace view public.item_duration_focus with (security_invoker = on) as
select i.id          as item_id,
       i.name        as item_name,
       i.focus_effect as spell_id,
       s.name        as spell_name,
       (select (s.raw->'base'->>(e.ord::int - 1))::int from jsonb_array_elements_text(s.raw->'eff') with ordinality as e(eff, ord)
         where e.eff = '128' order by e.ord limit 1) as pct,
       (select (s.raw->'base'->>(e.ord::int - 1))::int from jsonb_array_elements_text(s.raw->'eff') with ordinality as e(eff, ord)
         where e.eff = '134' order by e.ord limit 1) as max_level,
       (select (s.raw->'base'->>(e.ord::int - 1))::int from jsonb_array_elements_text(s.raw->'eff') with ordinality as e(eff, ord)
         where e.eff = '138' order by e.ord limit 1) as type_limit,
       (select (s.raw->'base'->>(e.ord::int - 1))::int from jsonb_array_elements_text(s.raw->'eff') with ordinality as e(eff, ord)
         where e.eff = '140' order by e.ord limit 1) as min_ticks
  from eqemu_items i
  join eqemu_spells s on s.id = i.focus_effect
 where i.focus_effect > 0
   and exists (select 1 from jsonb_array_elements_text(s.raw->'eff') x where x = '128');

grant select on public.item_duration_focus to anon, authenticated;
