-- Raid Mimic relay, auto mode: does this session's account own this character?
--
-- Auto mode (apps/raidmimic-relay/) decides who sees whom from the game itself: two members share only when each one's
-- Zeal group/raid list names the other. That is only trustworthy if a client cannot claim a character that is not
-- theirs, so the relay asks this function on every hello and refuses a name the token's account does not hold.
--
-- Same shape as relay_resolve_session (20261115150000_raidmimic_relay.sql): SECURITY DEFINER, pinned search_path,
-- EXECUTE for anon and service_role only, and it returns a bare boolean: no id, no name, no list of anyone's characters.
-- The token is matched exactly against mimic_sessions.session_token (shape-checked first). A revoked session, an expired
-- guest and a guest with no account all answer false.
--
-- A discord id owns a character when:
--   * hub_characters: a hub player with that discord id (not deleted) holds the name, and the claim is not 'contested'; or
--   * the Wolf Pack characters table: the row's own discord_id is the session's, or the row is an alt whose main
--     (main_name, same guild) has the session's discord id.
--
-- Idempotent: safe to apply twice. Apply BEFORE the relay 1.2.0 deploys (an older function missing makes every hello fail).

create or replace function public.relay_owns_character(p_token text, p_character text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
begin
  if p_token is null or p_token !~ '^wpms_[0-9a-f]{64}$' then
    return false;
  end if;
  if p_character is null or p_character !~ '^[A-Za-z'']{1,24}$' then
    return false;
  end if;

  select scope, discord_id, expires_at, revoked_at
    into s
    from public.mimic_sessions
   where session_token = p_token
   limit 1;
  if not found or s.revoked_at is not null or s.discord_id is null then
    return false;
  end if;
  if s.scope = 'guest' and (s.expires_at is null or s.expires_at <= now()) then
    return false;
  end if;

  if exists (
    select 1
      from public.hub_characters hc
      join public.hub_players hp on hp.player_id = hc.player_id
     where hp.discord_id = s.discord_id
       and hp.deleted_at is null
       and hc.name_lc = lower(p_character)
       and hc.proof <> 'contested'
  ) then
    return true;
  end if;

  return exists (
    select 1
      from public.characters c
     where lower(c.name) = lower(p_character)
       and (
         c.discord_id = s.discord_id
         or exists (
           select 1
             from public.characters m
            where m.guild_id = c.guild_id
              and lower(m.name) = lower(c.main_name)
              and m.discord_id = s.discord_id
         )
       )
  );
end;
$$;

revoke all on function public.relay_owns_character(text, text) from public, anon, authenticated;
grant execute on function public.relay_owns_character(text, text) to anon, service_role;
