'use strict';
// apps/raidmimic-relay/index.js — the Raid Mimic party relay: the socket glue. The rules (validation, tiers, the
// merge, parties, the session cache) are in lib.js and are what the tests cover.
//
// What it is: members of a group or raid connect from Mimic, publish their local overlay numbers about every 2 s,
// and get back one merged view. Everything lives in memory and nothing is written anywhere: a restart drops the
// parties and the clients reconnect. It never holds the Supabase service-role key; it asks two SECURITY DEFINER RPCs
// with the anon key who a Mimic session token belongs to (supabase/migrations/20261115150000_raidmimic_relay.sql).
//
// Protocol (WebSocket, /v1/party, JSON text frames):
//   client → hello {token, party? | create:true, character, agent_version}     first message, within 10 s
//   server → welcome {party, tier, member}   or   error {code}  then close
//   client → pub {perPlayer?, target?, casting?, roster?, fires?}              latest wins, about every 2 s
//   server → view {...}                                                        every 2 s, same view to every member
//   client → history {}      server → history {frames}                         paid parties only
//   client → bye {}                                                            leave now
//
// Env: PORT, SUPABASE_URL, SUPABASE_ANON_KEY, RELAY_ALLOWED_ORIGINS (optional, comma separated).

const http = require('node:http');
const { WebSocketServer } = require('ws');
const lib = require('./lib.js');

const VERSION = require('./package.json').version;
const VIEW_EVERY_MS = 2000;
const PING_EVERY_MS = 30000;
const HELLO_WITHIN_MS = 10000;
const SWEEP_EVERY_MS = 60000;

// One-line structured logs. Never a token, never a frame, never a character: counts, codes and party codes only.
function log(ev, fields = {}) { process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ev, ...fields }) + '\n'); }

// `rpc` is { resolve(token), startTrial(token) } (lib.cachedResolver in production, a stub in the tests).
function createRelay({ rpc, allowedOrigins = [], now = Date.now, randomInt, maxClients = lib.MAX_CLIENTS, viewEveryMs = VIEW_EVERY_MS, quiet = false } = {}) {
  const parties = new Map();                 // code → Party
  const clients = new Set();
  const limiter = new lib.FailLimiter();
  const say = quiet ? () => {} : log;

  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const fail = (ws, code, closeCode = 4400) => { send(ws, { type: 'error', code }); ws.close(closeCode, code); };

  function newParty() {
    for (let i = 0; i < 20; i++) {
      const code = lib.makeCode(randomInt);
      if (!parties.has(code)) { const p = new lib.Party(code, now()); parties.set(code, p); return p; }
    }
    return null;
  }

  function leave(ws) {
    clients.delete(ws);
    const p = ws.party;
    if (!p) return;
    ws.party = null;
    if (p.members.get(ws.memberKey)?.ws === ws) p.remove(ws.memberKey, now());
    say('leave', { party: p.code, members: p.members.size });
  }

  async function onHello(ws, msg, ip) {
    const h = lib.validateHello(msg);
    if (!h.ok) { limiter.fail(ip, now()); return fail(ws, h.code); }
    const { hello } = h;
    let identity;
    try { identity = await rpc.resolve(hello.token); } catch { return fail(ws, 'unavailable', 1013); }
    if (!identity) { limiter.fail(ip, now()); say('hello_rejected', { why: 'unknown_session' }); return fail(ws, 'unknown_session', 4401); }
    if (ws.readyState !== 1) return;

    // Creating a party starts the creator's one 14-day trial when they have never had one (idempotent in the RPC).
    if (hello.create && identity.tier === 'free' && !identity.trial_ends_at && identity.player_id) {
      try {
        await rpc.startTrial(hello.token);
        identity = (await rpc.resolve(hello.token)) || identity;
      } catch { /* a trial that could not start leaves the creator on free; the party still works */ }
    }

    const t = now();
    const member = lib.memberFrom(identity, hello.token, hello.character, t);
    let party;
    if (hello.create) {
      party = newParty();
      if (!party) return fail(ws, 'busy', 1013);
    } else {
      party = parties.get(hello.party);
      if (!party) { limiter.fail(ip, t); return fail(ws, 'no_party', 4404); }
    }
    const existing = party.members.get(member.key);
    if (existing) { send(existing.ws, { type: 'error', code: 'replaced' }); existing.ws.close(4000, 'replaced'); leave(existing.ws); }
    else if (!party.canJoin(member, t)) return fail(ws, 'party_full', 4409);

    party.add({ ...member, ws });
    ws.party = party; ws.memberKey = member.key; ws.helloed = true;
    clearTimeout(ws.helloTimer);
    send(ws, { type: 'welcome', party: party.code, tier: party.tier(t), member: member.character });
    say('join', { party: party.code, members: party.members.size, tier: party.tier(t), created: hello.create, agent: hello.agentVersion });
  }

  function onMessage(ws, data, ip) {
    const msg = lib.parseFrame(data);
    if (!ws.helloed) {
      if (ws.helloing) return;                                  // a second message while the first resolves is ignored
      if (!msg) { limiter.fail(ip, now()); return fail(ws, 'bad_hello'); }
      ws.helloing = true;
      onHello(ws, msg, ip).catch(() => { try { ws.close(1011); } catch { /* gone */ } });
      return;
    }
    if (!msg) return;                                           // a bad frame is dropped, not echoed, not fatal
    const t = now();
    if (msg.type === 'pub') {
      const v = lib.validatePub(msg, t);
      if (v.ok) ws.party.ingest(ws.memberKey, v.pub, t);
    } else if (msg.type === 'history') {
      if (ws.party.tier(t) === 'free') return send(ws, { type: 'error', code: 'tier' });
      send(ws, { type: 'history', party: ws.party.code, frames: ws.party.history });
    } else if (msg.type === 'bye') {
      ws.close(1000, 'bye');
    }
  }

  function onConnection(ws, req) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || 'unknown');   // the nearest proxy's entry
    if (clients.size >= maxClients) { send(ws, { type: 'error', code: 'busy' }); return ws.close(1013, 'busy'); }
    if (limiter.blocked(ip, now())) { send(ws, { type: 'error', code: 'slow_down' }); return ws.close(4429, 'slow_down'); }
    clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => onMessage(ws, data, ip));
    ws.on('close', () => { clearTimeout(ws.helloTimer); leave(ws); });
    ws.on('error', () => {});
    ws.helloTimer = setTimeout(() => { if (!ws.helloed) fail(ws, 'hello_timeout', 4408); }, HELLO_WITHIN_MS);
  }

  // Every tick: one view per party (stringified once), history, then expiry.
  function tick() {
    const t = now();
    for (const [code, p] of parties) {
      if (p.expired(t)) { parties.delete(code); say('party_end', { party: code }); continue; }
      if (!p.members.size) continue;
      p.sampleHistory(t);
      const body = JSON.stringify(p.view(t));
      for (const m of p.members.values()) if (m.ws.readyState === 1) m.ws.send(body);
    }
  }

  function heartbeat(clientSet = clients) {
    for (const ws of clientSet) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* closing */ }
    }
  }

  const originOk = (req) => {
    if (!allowedOrigins.length) return true;
    const o = req.headers.origin;
    return !o || allowedOrigins.includes(o);                    // Mimic is not a browser and sends no Origin
  };

  function health() { return { ok: true, version: VERSION, parties: parties.size, clients: clients.size }; }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(health()));
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 512 } });
  server.on('upgrade', (req, socket, head) => {
    const path = String(req.url || '').split('?')[0];
    if (path !== '/v1/party') { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
    if (!originOk(req)) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req));
  });

  const timers = [];
  function start(port, host) {
    timers.push(setInterval(tick, viewEveryMs), setInterval(() => heartbeat(), PING_EVERY_MS), setInterval(() => {
      for (const [code, p] of parties) if (p.expired(now())) { parties.delete(code); say('party_end', { party: code }); }
    }, SWEEP_EVERY_MS));
    timers.forEach((x) => x.unref && x.unref());
    return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
  }

  async function stop(reason = 'restart') {
    timers.forEach(clearInterval);
    for (const ws of clients) { try { send(ws, { type: 'bye', reason }); ws.close(1001, reason); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 200));
    for (const ws of clients) { try { ws.terminate(); } catch { /* gone */ } }
    wss.close();
    await new Promise((r) => server.close(() => r()));
  }

  return { server, start, stop, tick, heartbeat, health, parties, clients };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) { log('boot_failed', { why: 'SUPABASE_URL and SUPABASE_ANON_KEY are required' }); process.exit(1); }
  const rpc = lib.cachedResolver(lib.supabaseRpc({ url, anonKey }));
  const allowedOrigins = String(process.env.RELAY_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const relay = createRelay({ rpc, allowedOrigins });
  const port = await relay.start(Number(process.env.PORT) || 8080, '0.0.0.0');
  log('listening', { port, version: VERSION });
  let stopping = false;
  const shutdown = (sig) => {
    if (stopping) return;
    stopping = true;
    log('shutdown', { sig });
    relay.stop('restart').then(() => process.exit(0), () => process.exit(1));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) main();
module.exports = { createRelay };
