-- Raid Mimic party relay (apps/raidmimic-relay/): who a Mimic session token belongs to, and the Pro trial.
--
-- The relay is its own small service on its own Railway project and must NOT hold the service-role key. It calls the
-- two functions below with the ANON key. Both are SECURITY DEFINER, granted to anon for EXECUTE only, and return
-- nothing but the identity fields the relay needs: never the token, never a hash, never a Discord id.
--
-- mimic_sessions stores the token PLAIN in session_token (utils/mimicLink.js reads it with session_token=eq.<token>),
-- so the lookup matches it exactly. A real token is 'wpms_' + 64 hex characters, checked first so an arbitrary string
-- never reaches the table. Revoked (revoked_at set) and expired-guest sessions resolve to null, as in the bot.
--
-- Tier rule (mirrored in apps/raidmimic-relay/lib.js playerTier, pinned by test/raidmimic-relay.test.js):
--   'pro'   a Wolf Pack member session, or a player with plan 'pro', or an active member (left_at null) of an
--           unsuspended guild whose plan is 'managed'
--   'trial' now() < the player's trial_ends_at
--   'free'  everything else (a guest is always free)
--
-- Idempotent: safe to apply twice. Apply BEFORE the relay deploys.

-- ── Entitlements: one row per player, written by relay_start_trial and by an operator for a 'pro' grant ───────
create table if not exists public.hub_player_entitlements (
  player_id        uuid primary key references public.hub_players (player_id) on delete cascade,
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  trial_started_at timestamptz,
  trial_ends_at    timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.hub_player_entitlements enable row level security;
-- No policies: only service_role (which bypasses RLS) and the definer functions below touch it.
revoke all on public.hub_player_entitlements from anon, authenticated;

-- ── Who is this token? ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.relay_resolve_session(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s            record;
  v_player     record;
  v_member     record;
  v_ent        record;
  v_guild      record;
  v_home       boolean;
  v_name       text;
  v_plan       text;
  v_pro        boolean := false;
  v_tier       text;
begin
  if p_token is null or p_token !~ '^wpms_[0-9a-f]{64}$' then
    return null;
  end if;

  select scope, discord_id, user_id, guild_id, guest_label, expires_at, revoked_at
    into s
    from public.mimic_sessions
   where session_token = p_token
   limit 1;
  if not found or s.revoked_at is not null then
    return null;
  end if;

  -- A guest (officer-approved, time-limited, from another guild) has no player and is always free.
  if s.scope = 'guest' then
    if s.expires_at is null or s.expires_at <= now() then
      return null;
    end if;
    return jsonb_build_object(
      'player_id', null, 'display_name', coalesce(s.guest_label, 'Guest'), 'scope', 'guest',
      'guild_id', s.guild_id, 'hub_plan', null, 'tier', 'free', 'trial_ends_at', null);
  end if;

  select null::text as plan, null::timestamptz as trial_ends_at into v_ent;   -- assigned, so it reads null with no row

  select player_id, display_name into v_player
    from public.hub_players
   where discord_id = s.discord_id and deleted_at is null
   limit 1;

  v_home := coalesce(s.guild_id, 'wolfpack') = 'wolfpack';   -- hub_guilds forbids a guild named 'wolfpack'
  v_name := null;
  v_plan := null;

  if s.scope = 'player' then
    -- The free flag-sync link: a hub account and nothing else (guild_id is the '~player' marker, not a guild).
    if v_player.player_id is null then return null; end if;
    v_name := v_player.display_name;
  elsif not v_home then
    -- A session linked to a hub guild resolves through that guild's roster; leaving it or a suspension ends the session.
    select plan into v_guild from public.hub_guilds where guild_id = s.guild_id and suspended_at is null;
    if not found or v_player.player_id is null then return null; end if;
    perform 1 from public.hub_memberships
      where guild_id = s.guild_id and player_id = v_player.player_id and left_at is null;
    if not found then return null; end if;
    v_name := v_player.display_name;
    v_plan := v_guild.plan;
  else
    -- A Wolf Pack member session: pro by being a member. An explicit is_member = false ends it, as in the bot.
    select nickname, global_name, is_member into v_member
      from public.wolfpack_members
     where (s.user_id is not null and user_id = s.user_id) or (s.user_id is null and discord_id = s.discord_id)
     limit 1;
    if found and v_member.is_member is false then return null; end if;
    v_pro := true;
    v_name := coalesce(v_member.nickname, v_member.global_name, v_player.display_name);
  end if;

  if v_player.player_id is not null then
    select plan, trial_ends_at into v_ent from public.hub_player_entitlements where player_id = v_player.player_id;
    if found and v_ent.plan = 'pro' then v_pro := true; end if;
    if exists (
      select 1
        from public.hub_memberships hm
        join public.hub_guilds hg on hg.guild_id = hm.guild_id
       where hm.player_id = v_player.player_id and hm.left_at is null
         and hg.plan = 'managed' and hg.suspended_at is null
    ) then v_pro := true; end if;
  end if;

  if v_pro then
    v_tier := 'pro';
  elsif v_ent.trial_ends_at is not null and now() < v_ent.trial_ends_at then
    v_tier := 'trial';
  else
    v_tier := 'free';
  end if;

  return jsonb_build_object(
    'player_id', v_player.player_id, 'display_name', v_name, 'scope', coalesce(s.scope, 'member'),
    'guild_id', coalesce(s.guild_id, 'wolfpack'), 'hub_plan', v_plan, 'tier', v_tier,
    'trial_ends_at', v_ent.trial_ends_at);
end;
$$;

-- ── Start the 14-day trial: once per player, idempotent ───────────────────────────────────────────────────────
create or replace function public.relay_start_trial(p_token text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r      jsonb := public.relay_resolve_session(p_token);
  v_id   uuid;
  v_ends timestamptz;
begin
  if r is null or r->>'player_id' is null then
    return null;                                 -- unknown session, or one with no hub account (a guest)
  end if;
  v_id := (r->>'player_id')::uuid;
  insert into public.hub_player_entitlements (player_id, plan, trial_started_at, trial_ends_at)
  values (v_id, 'free', now(), now() + interval '14 days')
  on conflict (player_id) do nothing;
  select trial_ends_at into v_ends from public.hub_player_entitlements where player_id = v_id;
  return v_ends;
end;
$$;

revoke all on function public.relay_resolve_session(text) from public, anon, authenticated;
revoke all on function public.relay_start_trial(text)     from public, anon, authenticated;
grant execute on function public.relay_resolve_session(text) to anon, service_role;
grant execute on function public.relay_start_trial(text)     to anon, service_role;
