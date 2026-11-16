-- "Delete everything" closes the two gaps the privacy page disclosed (the guild lead, 2026-11-15, Desk: "A, close them";
-- DECISIONS §593):
--   1. the party trial row (hub_player_entitlements, 20261115150000_raidmimic_relay.sql) is deleted with the player's
--      other hub rows (it is keyed by player_id; the anonymised hub_players row means the cascade never fires);
--   2. the ids the function deleted by go into self_delete_forget (20261116000000), so the nightly archive merge deletes
--      the same person's page_views, tells, trigger_timing_feedback and raid_roster rows from its own copy.
--
-- This redefines member_self_delete from 20261115230100_self_delete_hub_inventory.sql with exactly those two additions,
-- both in step 4b below. Everything else is unchanged. Idempotent: CREATE OR REPLACE.
-- ⚠ CONTAINS DELETE STATEMENTS (inside the function): paste it by hand into the SQL Editor, after 20261116000000.

create or replace function public.member_self_delete(p_discord_id text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  n        int;
  v_counts jsonb := '{}'::jsonb;
  v_guild  text;
  v_player uuid;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{5,25}$' or p_user_id is null then
    raise exception 'member_self_delete: need a Discord id and a login id';
  end if;
  -- The login must be the one the members table has for this Discord id (or not yet linked at all).
  if exists (select 1 from public.wolfpack_members where user_id = p_user_id and discord_id <> p_discord_id) then
    raise exception 'member_self_delete: identity_mismatch';
  end if;

  select guild_id into v_guild from public.wolfpack_members where discord_id = p_discord_id;
  v_guild := coalesce(v_guild, 'wolfpack');

  -- A guild's only owner cannot disappear and leave it without one.
  select player_id into v_player from public.hub_players where discord_id = p_discord_id;
  if v_player is not null and exists (
    select 1 from public.hub_memberships m join public.hub_guilds g on g.guild_id = m.guild_id
    where m.player_id = v_player and m.role = 'owner' and m.left_at is null and g.suspended_at is null
  ) then
    raise exception 'member_self_delete: owns_guild';
  end if;

  -- 1. Per-character private uploads and live state, through the person's own characters (same guild, any case).
  --    Runs BEFORE the characters are unlinked.
  for r in select * from (values
    ('character_live_state',     'character'),
    ('character_inventory',      'character_name'),
    ('character_spellbook',      'character_name'),
    ('character_keys',           'character_name'),
    ('character_quest_prefs',    'character_name'),
    ('character_active_turnins', 'character_name'),
    ('character_worn_sets',      'character_name'),
    ('character_accounts',       'character_name')
  ) as t(tbl, col) loop
    execute format(
      'delete from public.%I t where exists (select 1 from public.characters c where c.discord_id = $1 and c.guild_id = t.guild_id and lower(c.name) = lower(t.%I))',
      r.tbl, r.col) using p_discord_id;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(r.tbl, n);
  end loop;

  -- 2. The person's own rows, keyed on their Discord id.
  for r in select * from (values
    ('tells',                    'owner_discord_id'),
    ('character_live_state',     'uploaded_by'),
    ('member_onboarding_state',  'discord_id'),
    ('agent_clock_offsets',      'discord_id'),
    ('buff_lag_reports',         'discord_id'),
    ('feedback',                 'submitter_discord_id'),
    ('feedback_replies',         'author_discord_id'),
    ('ui_snapshots',             'owner_discord_id'),
    ('ui_pending_edits',         'owner_discord_id'),
    ('ui_socials_index',         'owner_discord_id'),
    ('personal_trigger_sync',    'owner_discord_id'),
    ('trigger_timing_feedback',  'voter_discord_id'),
    ('game_accounts',            'owner_discord_id'),
    ('crash_reports',            'uploaded_by_discord_id'),
    ('pop_rescan_requests',      'discord_id'),
    ('character_link_requests',  'requester_discord_id'),
    ('gallery_masterpieces',     'author_discord_id'),
    ('gallery_reports',          'reporter_discord_id'),
    ('voice_reports',            'reporter_discord_id'),
    ('mimic_sessions',           'discord_id'),
    ('mimic_link_codes',         'authorized_discord_id'),
    ('raid_roster',              'uploaded_by_discord_id')
  ) as t(tbl, col) loop
    execute format('delete from public.%I where %I = $1', r.tbl, r.col) using p_discord_id;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(r.tbl, coalesce((v_counts ->> r.tbl)::int, 0) + n);
  end loop;

  -- 3. The person's own rows, keyed on their login id.
  for r in select * from (values
    ('roadmap_votes',            'user_id'),
    ('overlay_design_feedback',  'user_id'),
    ('overlay_design_votes',     'user_id'),
    ('page_views',               'user_id'),
    ('test_server_comments',     'user_id'),
    ('test_server_interests',    'user_id'),
    ('mimic_sessions',           'user_id'),
    ('mimic_link_codes',         'authorized_user_id')
  ) as t(tbl, col) loop
    execute format('delete from public.%I where %I = $1', r.tbl, r.col) using p_user_id;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(r.tbl, coalesce((v_counts ->> r.tbl)::int, 0) + n);
  end loop;

  -- Rows that carry the id only as "who linked / pushed it" on somebody else's record: keep the record, drop the id.
  update public.mimic_sessions      set linked_by_discord_id     = null where linked_by_discord_id     = p_discord_id;
  update public.mimic_link_codes    set authorized_by_discord_id = null where authorized_by_discord_id = p_discord_id;
  update public.personal_trigger_sync set pushed_by_discord_id   = null where pushed_by_discord_id     = p_discord_id;

  -- 4. Hub player (raidmimic.com): leave every guild, drop the activity log, anonymise the row. The row itself
  --    stays because guilds and invites they created point at it.
  if v_player is not null then
    update public.hub_memberships set left_at = coalesce(left_at, now()) where player_id = v_player;
    delete from public.hub_player_activity where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_player_activity', n);
    delete from public.hub_flags where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_flags', n);
    delete from public.hub_player_targets where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_player_targets', n);
    delete from public.hub_player_guilds where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_player_guilds', n);
    delete from public.hub_inventory where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_inventory', n);
    delete from public.hub_characters where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_characters', n);
    update public.hub_players
       set discord_id = 'deleted:' || player_id::text, display_name = 'Deleted player', avatar_url = null,
           deleted_at = coalesce(deleted_at, now())
     where player_id = v_player;
    v_counts := v_counts || jsonb_build_object('hub_players', 1);
    -- 4b(1). The party trial row.
    delete from public.hub_player_entitlements where player_id = v_player;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('hub_player_entitlements', n);
  end if;

  -- 4b(2). Tell the archive to forget the same rows (scripts/lib/archive-merge.sql reads this the next night).
  insert into public.self_delete_forget (user_id, discord_id) values (p_user_id, p_discord_id)
  on conflict (user_id) do update set discord_id = excluded.discord_id, forgotten_at = now();

  -- 5. The character link. The characters stay (the guild's roster and parses use the names); the Discord account
  --    behind them goes.
  update public.characters
     set discord_id = null, registered_via_web_by_discord_id = null
   where discord_id = p_discord_id;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('characters_unlinked', n);
  update public.characters set registered_via_web_by_discord_id = null where registered_via_web_by_discord_id = p_discord_id;

  -- 6. The members row keeps mirroring the Discord server; only the website login link is cleared. Clearing it
  --    BEFORE the auth user is deleted matters: wolfpack_members.user_id cascades from auth.users.
  update public.wolfpack_members set user_id = null, tells_dm_paused_until = null where discord_id = p_discord_id;

  -- 7. The export rate-limit marker.
  delete from public.bot_kv where key = 'data_export:' || p_user_id::text;

  -- 8. The audit row: counts only. No Discord id, no name, no content, so the record of a deletion is not itself
  --    a way back to the person.
  insert into public.audit_log (action, actor_discord_id, actor_name, payload, guild_id)
  values ('account_deleted', null, null, jsonb_build_object('self_service', true, 'removed', v_counts), v_guild);

  return v_counts;
end;
$$;

revoke all on function public.member_self_delete(text, uuid) from public, anon, authenticated;
grant execute on function public.member_self_delete(text, uuid) to service_role;
