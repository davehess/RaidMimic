// utils/platformStalls.js — the stall rule for the platform-admin DM (the guild lead, 2026-11-18, Desk card
// platform-admin): a Raid Mimic hub guild more than 24 h old with no invite made and still one active member.
// Pure rule + the hourly pass; the owner's ids come from SITE_OWNER_DISCORD_IDS (unset = skip quietly).

const DAY_MS = 24 * 3600 * 1000;
const KV_PREFIX = 'platform_stall_dm:';
const MAX_AGE_DAYS = 14;   // older stalled guilds are history, not news; keeps the first run from DMing every old guild

function ownerIds(env = process.env) {
  return String(env.SITE_OWNER_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d{5,25}$/.test(s));
}

// guilds: [{guild_id, display_name, created_at, suspended_at?}]; members/invites: Map or object guild_id -> count;
// dmed: Set of guild_ids already told.
function stalledGuilds({ guilds, members, invites, dmed, now = Date.now(), maxAgeDays = MAX_AGE_DAYS }) {
  const get = (m, k) => (m instanceof Map ? m.get(k) : (m || {})[k]) || 0;
  return (guilds || []).filter(g => {
    if (!g || !g.guild_id || g.suspended_at) return false;
    const age = now - Date.parse(g.created_at);
    if (!(age > DAY_MS) || age > maxAgeDays * DAY_MS) return false;
    if (dmed && dmed.has(g.guild_id)) return false;
    return get(invites, g.guild_id) === 0 && get(members, g.guild_id) <= 1;
  });
}

function dmText(g) {
  return `Raid Mimic guild stalled: **${String(g.display_name || 'a guild').slice(0, 80)}** was made over a day ago, has no invite and still one member.\nhttps://raidmimic.com/guilds/${g.guild_id}`;
}

function _countBy(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) m.set(r.guild_id, (m.get(r.guild_id) || 0) + 1);
  return m;
}

// One pass. Dependencies are injectable for tests: { supabase, client, now, env }.
async function runStallCheck({ supabase, client, now = Date.now(), env = process.env }) {
  const owners = ownerIds(env);
  if (!owners.length || !supabase.isEnabled()) return { skipped: true, dmed: 0 };
  const since = new Date(now - MAX_AGE_DAYS * DAY_MS).toISOString();
  const before = new Date(now - DAY_MS).toISOString();
  const guilds = await supabase.select('hub_guilds',
    `created_at=gte.${since}&created_at=lt.${before}&suspended_at=is.null&select=guild_id,display_name,created_at,suspended_at&order=created_at.desc&limit=200`);
  if (!Array.isArray(guilds) || !guilds.length) return { skipped: false, dmed: 0 };
  const ids = guilds.map(g => g.guild_id).join(',');
  const [mem, inv] = await Promise.all([
    supabase.selectAllPaged('hub_memberships', `guild_id=in.(${ids})&left_at=is.null&select=guild_id,player_id`, 'guild_id,player_id'),
    supabase.selectAllPaged('hub_invites', `guild_id=in.(${ids})&select=guild_id,code`, 'code'),
  ]);
  if (!Array.isArray(mem) || !Array.isArray(inv)) return { skipped: true, dmed: 0 };   // a failed read must not look like "no invites"
  const kvGuild = env.SUPABASE_GUILD_ID || 'wolfpack';
  const kv = await supabase.select('bot_kv',
    `guild_id=eq.${encodeURIComponent(kvGuild)}&key=like.${KV_PREFIX}*&select=key&limit=1000`);
  if (!Array.isArray(kv)) return { skipped: true, dmed: 0 };
  const dmed = new Set(kv.map(r => String(r.key).slice(KV_PREFIX.length)));
  const stalled = stalledGuilds({ guilds, members: _countBy(mem), invites: _countBy(inv), dmed, now });
  let sent = 0;
  for (const g of stalled) {
    let ok = false;
    for (const id of owners) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user && await user.send({ content: dmText(g) }).then(() => true).catch(() => false)) ok = true;
    }
    if (!ok) continue;   // nobody reachable: try again next hour
    await supabase.upsert('bot_kv', [{ guild_id: kvGuild, key: KV_PREFIX + g.guild_id,
      value: { at: new Date(now).toISOString() }, updated_at: new Date(now).toISOString() }], 'guild_id,key').catch(() => {});
    sent++;
  }
  return { skipped: false, dmed: sent };
}

module.exports = { ownerIds, stalledGuilds, dmText, runStallCheck, KV_PREFIX, MAX_AGE_DAYS };
