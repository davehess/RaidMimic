// utils/platformStatsAuth.js — how /admin/platform on the web proves itself to GET /api/platform/stats.
// The bot's other routes take per-user session tokens, which the web server does not hold, and the old shared agent
// token is retired. A dedicated secret, PLATFORM_STATS_SECRET, set on both services (the guild lead's pick over reusing the
// database service key, 2026-11-18: one leak is not the other). The web sends HMAC-SHA256(secret, "platform-stats:<minute>")
// in `x-platform-sig`; the secret never travels; a signature is good for the current and previous minute. Unset = refuse.
const crypto = require('crypto');

function sign(key, minute) {
  return crypto.createHmac('sha256', key).update(`platform-stats:${minute}`).digest('hex');
}

function verify(headerValue, key, now = Date.now()) {
  if (!key || typeof headerValue !== 'string' || !/^[0-9a-f]{64}$/.test(headerValue)) return false;
  const minute = Math.floor(now / 60000);
  const got = Buffer.from(headerValue, 'hex');
  return [minute, minute - 1].some(m => crypto.timingSafeEqual(got, Buffer.from(sign(key, m), 'hex')));
}

module.exports = { sign, verify };
