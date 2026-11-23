// test/mgb-board-agent.test.js — the MGB board (agent half; the bot half is test/mgb-board.test.js): the agent reads the activation line from its own log, keeps a local 72-minute
// timer, queues one POST, reads the bot's board fail-soft, and the Command Center card + Raid tab dot draw it.
//
// The agent's REAL block and command.html's REAL card functions run from source (comment-stripped for text assertions).
// Names are invented fixtures.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, AGENT_INDEX, ROOT } from './_source-slice.js';

const agentSrc = readSource(AGENT_INDEX);
const cmd = readSource(path.join(ROOT, 'apps', 'mimic', 'command.html'));
const dash = readSource(path.join(ROOT, 'packages', 'wolfpack-logsync', 'dashboard.html'));
const classAbilities = readSource(path.join(ROOT, 'docs', 'data', 'class-abilities.json'));

const TEXT = 'The next group buff you cast will hit all targets in range.';
const agentBlock = sliceBlock(agentSrc, '// ── MGB board (Command Center "MGB" card', '\n// ── PoP raid objectives proxy (popraid.html)');
function loadAgent(queued) {
  const fakeConsole = { log: () => {} };
  // eslint-disable-next-line no-new-func
  return new Function('http', 'https', 'console', 'AGENT_VERSION', 'enqueueUpload',
    'let _uploadOpts = null;\n' + agentBlock + '\n'
    + 'return { parseMgbActivation, noteMgbLine, mgbOwnSnapshot, _mgbNormalizeBoard, fetchMgbBoard, _mgbSnapshot, board: () => _mgbBoard,'
    + ' setOpts: (o) => { _uploadOpts = o; }, MGB_RECAST_MS };')(http, https, fakeConsole, 't', (kind, body) => queued.push({ kind, body }));
}
const line = (msg, stamp = 'Thu Nov 19 20:45:10 2026') => `[${stamp}] ${msg}`;
const T0 = Date.UTC(2026, 10, 20, 1, 45, 10);

describe('the activation line', () => {
  let queued, agent;
  beforeEach(() => { queued = []; agent = loadAgent(queued); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('the text in the code is the text in class-abilities.json', () => {
    expect(classAbilities).toContain('"log_text": "' + TEXT + '"');
    expect(stripJs(agentBlock)).toContain(TEXT);
  });

  it('matches the exact line, and only that', () => {
    expect(agent.parseMgbActivation(line(TEXT))).toBe(true);
    expect(agent.parseMgbActivation(line(TEXT) + '  ')).toBe(true);
  });

  it('a line quoted in chat, or with anything around it, does not match', () => {
    expect(agent.parseMgbActivation(line("Aldenmar tells the raid, '" + TEXT + "'"))).toBe(false);
    expect(agent.parseMgbActivation(line("You tell your guild, '" + TEXT + "'"))).toBe(false);
    expect(agent.parseMgbActivation(line('Brackwyn says, ' + TEXT))).toBe(false);
    expect(agent.parseMgbActivation(line('Corvale tells the group, ' + TEXT))).toBe(false);
    expect(agent.parseMgbActivation(line('Note: ' + TEXT))).toBe(false);
    expect(agent.parseMgbActivation(TEXT)).toBe(false);   // no timestamp: not a log line
    expect(agent.parseMgbActivation(line('The next group buff you cast will hit all targets in range'))).toBe(false);
  });

  it('local timer: 72 minutes (4320 s) from the activation, with no bot', () => {
    expect(agent.MGB_RECAST_MS).toBe(4320 * 1000);
    expect(agent.noteMgbLine(line(TEXT), 'Aldenmar', T0, T0 + 1000, true)).toBe(true);
    const o = agent.mgbOwnSnapshot();
    expect(o.character).toBe('Aldenmar');
    expect(o.ready_ms - o.at_ms).toBe(72 * 60 * 1000);
  });

  it('the first cast within 60 s names the spell and the activation is queued once with it', () => {
    agent.noteMgbLine(line(TEXT), 'Aldenmar', T0, T0, true);
    expect(queued).toHaveLength(0);
    agent.noteMgbLine(line('You begin casting Spirit of Wolf.'), 'Aldenmar', T0 + 5000, T0 + 5000, true);
    expect(queued).toEqual([{ kind: 'mgb', body: { character: 'Aldenmar', at: new Date(T0).toISOString(), spell: 'Spirit of Wolf' } }]);
    agent.noteMgbLine(line('You begin casting Other Spell.'), 'Aldenmar', T0 + 9000, T0 + 9000, true);
    vi.advanceTimersByTime(120_000);
    expect(queued).toHaveLength(1);
  });

  it('no cast: the activation goes out after 60 s without a spell', () => {
    agent.noteMgbLine(line(TEXT), 'Aldenmar', T0, T0, true);
    vi.advanceTimersByTime(59_000);
    expect(queued).toHaveLength(0);
    vi.advanceTimersByTime(2_000);
    expect(queued).toEqual([{ kind: 'mgb', body: { character: 'Aldenmar', at: new Date(T0).toISOString() } }]);
  });

  it('a cast later than 60 s does not fill the spell', () => {
    agent.noteMgbLine(line(TEXT), 'Aldenmar', T0, T0, true);
    agent.noteMgbLine(line('You begin casting Spirit of Wolf.'), 'Aldenmar', T0 + 61_000, T0 + 61_000, true);
    expect(queued).toHaveLength(0);
    vi.advanceTimersByTime(61_000);
    expect(queued[0].body.spell).toBeUndefined();
  });

  it('a replayed old line and a guest log never queue; a guest still has no timer sent', () => {
    expect(agent.noteMgbLine(line(TEXT), 'Aldenmar', T0 - 10 * 60_000, T0, true)).toBe(false);
    expect(agent.mgbOwnSnapshot()).toBe(null);
    agent.noteMgbLine(line(TEXT), 'Brackwyn', T0, T0, false);
    vi.advanceTimersByTime(61_000);
    expect(queued).toHaveLength(0);
  });
});

describe('the bot board, fail-soft', () => {
  let server, port, answer, agent, queued;
  beforeEach(async () => {
    queued = [];
    answer = { status: 200, body: null };
    server = http.createServer((req, res) => { res.writeHead(answer.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(answer.body)); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    agent = loadAgent(queued);
    agent.setOpts({ botUrl: `http://127.0.0.1:${port}/api/agent/encounter`, token: 'wpms_x' });
  });
  afterEach(async () => { await new Promise(r => server.close(r)); });
  const settle = async () => { for (let i = 0; i < 40 && agent.board().inflight; i++) await new Promise(r => setTimeout(r, 10)); await new Promise(r => setTimeout(r, 10)); };

  it('404 and 503: no card, and the agent backs off instead of asking every poll', async () => {
    for (const status of [404, 503]) {
      answer = { status, body: { error: 'x' } };
      agent.board().at = 0; agent.board().retryAt = 0;
      agent.fetchMgbBoard(); await settle();
      expect(agent._mgbSnapshot()).toBe(null);
      expect(agent.board().retryAt).toBeGreaterThan(Date.now());
    }
  });

  it('a normal answer becomes the board, times moved onto this clock', async () => {
    const now = Date.now();
    const botNow = new Date(now - 30_000).toISOString();   // the bot's clock runs 30 s behind this PC
    answer = { status: 200, body: {
      now: botNow,
      mgbs: [{ at: new Date(now - 90_000).toISOString(), spell: 'Aegolism', spell_id: 1, targets: 38, groups: 6, caster: 'Aldenmar', basis: 'own_log', candidates: [] }],
      holders: [{ name: 'Aldenmar', class: 'Cleric', ready_at: new Date(now + 60_000).toISOString(), last_spell: 'Aegolism', basis: 'own_log' },
                { name: 'Brackwyn', class: 'Druid', ready_at: null, last_spell: null, basis: null }],
    } };
    agent.fetchMgbBoard(); await settle();
    const s = agent._mgbSnapshot();
    expect(s.holders.map(h => h.name)).toEqual(['Aldenmar', 'Brackwyn']);
    expect(s.holders[1].ready_ms).toBe(null);
    expect(Math.abs(s.holders[0].ready_ms - (now + 60_000 + 30_000))).toBeLessThan(2000);
    expect(s.last.targets).toBe(38);
    expect(s.last.caster).toBe('Aldenmar');
  });

  it('garbage answers and a missing board with no local timer give null, never a throw', async () => {
    answer = { status: 200, body: { nonsense: true } };
    agent.fetchMgbBoard(); await settle();
    expect(agent._mgbSnapshot()).toBe(null);
    expect(agent._mgbNormalizeBoard(null, 0)).toBe(null);
    expect(agent._mgbNormalizeBoard('x', 0)).toBe(null);
  });

  it('with no bot at all the viewer still gets their own timer', () => {
    const fresh = loadAgent([]);
    expect(fresh._mgbSnapshot()).toBe(null);
    const t = Date.now();
    fresh.noteMgbLine(line(TEXT), 'Aldenmar', t, t, false);
    const s = fresh._mgbSnapshot();
    expect(s.holders).toEqual([]);
    expect(s.own.ready_ms).toBe(t + 4320_000);
  });

  it('this machine own timer wins over a stale row for its own character', async () => {
    const now = Date.now();
    answer = { status: 200, body: { now: new Date(now).toISOString(), mgbs: [], holders: [{ name: 'Aldenmar', class: 'Cleric', ready_at: new Date(now - 1000).toISOString(), last_spell: null, basis: null }] } };
    agent.fetchMgbBoard(); await settle();
    agent.noteMgbLine(line(TEXT), 'Aldenmar', now, now, false);
    const s = agent._mgbSnapshot();
    expect(s.holders[0].ready_ms).toBe(now + 4320_000);
  });
});

describe('command.html: the MGB card', () => {
  const END = '\n  function paintMgbClocks';
  const block = sliceBlock(cmd, '  var MGB_CLASS_ORDER = ', END).replace(END, '');
  function api(collapsed = false) {
    // eslint-disable-next-line no-new-func
    return new Function('esc', '_isCollapsed', 'secToggle', block + '\nreturn { mgbHtml, mgbClockState, mgbAgoText };')(
      (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
      () => collapsed, (key, label, count) => `<span class="sec-toggle" data-collapse-key="${key}">${label}${count != null ? ` (${count})` : ''}</span>`);
  }
  const H = (name, cls, ready_ms = null, last_spell = null) => ({ name, cls, ready_ms, last_spell, basis: null });
  const state = () => ({
    last: { at_ms: T0, spell: 'Aegolism', caster: 'Aldenmar', basis: 'own_log', targets: 38, candidates: [] },
    holders: [H('Nyssara', 'Magician'), H('Zarrin', 'Cleric', T0 + 100_000, 'Aegolism'), H('Corvale', 'Druid'), H('Aldenmar', 'Cleric'),
              H('Rethlan', 'Enchanter'), H('Brackwyn', 'Shaman'), H('Odd', 'Bard'), H('Lost', null), H('Vexa', 'Beastlord')],
    own: null,
  });

  it('groups by class in the set order, names sorted inside, unknown classes last', () => {
    const h = api().mgbHtml(state());
    const classes = [...h.matchAll(/class="mgb-cls">([^<]+)</g)].map(m => m[1]);
    expect(classes).toEqual(['Cleric', 'Druid', 'Shaman', 'Enchanter', 'Magician', 'Beastlord', 'Bard', 'Other']);
    const cleric = h.slice(h.indexOf('>Cleric<'), h.indexOf('>Druid<'));
    expect(cleric.indexOf('Aldenmar')).toBeLessThan(cleric.indexOf('Zarrin'));
    expect(cleric).toContain('Aegolism');
  });

  it('header line carries spell, caster, count and the basis marker', () => {
    const h = api().mgbHtml(state());
    expect(h).toContain('✓');
    expect(h).toContain('Last MGB: Aegolism by Aldenmar');
    expect(h).toContain('(38 raiders)');
    const u = state(); u.last = { at_ms: T0, spell: null, caster: null, basis: 'candidates', targets: 0, candidates: ['Zarrin', 'Corvale'] };
    const hu = api().mgbHtml(u);
    expect(hu).toContain('by unknown');
    expect(hu).toContain('?');
    expect(hu).toContain('Zarrin, Corvale');
    const c = state(); c.last.basis = 'cast_stream';
    expect(api().mgbHtml(c)).toContain('≈');
  });

  it('byte-stable: same input, same HTML; no ticking text in it', () => {
    const a = api().mgbHtml(state()), b = api().mgbHtml(state());
    expect(a).toBe(b);
    expect(a).not.toMatch(/down \d|ready<|ago<| ago/);
    expect(a).toContain('data-end="' + (T0 + 100_000) + '"');
    expect(a).toContain('data-end="0"');
  });

  it('clock math: ready, down m:ss, rounding up, ready_at null is ready', () => {
    const f = api();
    expect(f.mgbClockState(0, T0)).toEqual({ text: 'ready', ready: true });
    expect(f.mgbClockState(T0 - 1, T0).ready).toBe(true);
    expect(f.mgbClockState(T0 + 61_000, T0)).toEqual({ text: 'down 1:01', ready: false });
    expect(f.mgbClockState(T0 + 500, T0).text).toBe('down 0:01');
    expect(f.mgbClockState(T0 + 4320_000, T0).text).toBe('down 72:00');
    expect(f.mgbAgoText(T0, T0 + 125_000)).toBe('2:05 ago');
  });

  it('collapsed shows the toggle and the count only; empty or odd input draws nothing', () => {
    const h = api(true).mgbHtml(state());
    expect(h).toContain('MGB (9)');
    expect(h).not.toContain('mgb-row');
    expect(api().mgbHtml(null)).toBe('');
    expect(api().mgbHtml({ holders: [], last: null, own: null })).toBe('');
    expect(api().mgbHtml({ holders: [], last: null, own: { ready_ms: T0, character: 'Aldenmar' } })).toContain('Your MGB');
  });

  it('a throw in the card hides the card, not the Command Center; the card text has no backslash, backtick or template', () => {
    const src = stripJs(cmd);
    expect(src).toMatch(/if \(s\.mgb\) \{ try \{ html \+= mgbHtml\(s\.mgb\); \} catch \(e\) \{ void e; \} \}/);
    expect(block).not.toMatch(/[`\\]|\$\{/);
  });
});

describe('wiring', () => {
  const a = stripJs(agentSrc);
  it('the activation is a durable kind routed to /mgb, fed from the log loop, and in the Command Center state', () => {
    expect(a).toMatch(/case 'mgb':\s+return base \+ '\/mgb';/);
    expect(a).toMatch(/noteMgbLine\(line, b\.character, _mts \? _mts\.getTime\(\) : Date\.now\(\), Date\.now\(\), !_sourceGuest\)/);
    expect(a).toMatch(/mgb:\s+_mgbSnapshot\(\),/);
    expect(a).toMatch(/payload\.mgb = _mgbSnapshot\(\);/);
    expect(a).toContain("'/mgb-board'");
  });
  it('the Raid tab badge gets a ready/down dot and stays byte-stable (only data-end in the HTML)', () => {
    const d = stripJs(dash);
    expect(d).toContain('class="wp-mgb-dot" data-end="');
    expect(d).toMatch(/morphInto\(root, h\);\s+wpPaintMgbDots\(\);/);
    expect(d).toContain("'MGB in '");
  });
});
