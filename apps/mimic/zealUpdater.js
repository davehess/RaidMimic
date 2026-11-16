// zealUpdater.js — keep CoastalRedwood/Zeal current without hand file-ops.
//
// Why this exists: on the Steam Deck (and honestly on Windows too) the manual
// Zeal update dance — download zeal_v[#].zip, unzip, drag Zeal.asi into the
// client folder, drag uifiles/ over the top — is exactly the kind of file
// shuffling that's miserable in Desktop Mode on a handheld. Mimic already owns
// the EQ client folder for UI Studio, so it can do this for the user: fetch the
// latest release, back up what's there, and drop the new files in place.
//
// Scope, deliberately narrow (mirrors the official Quarm.Guide steps):
//   • install the top-level  Zeal.asi
//   • merge everything under  uifiles/**
//   • touch nothing else in the zip (readme/license/etc.) and nothing else in
//     the EQ folder — every replaced file gets a timestamped .bak first.
//
// The download/unzip/backup machinery is shared with uiPacks.js via ghDownload.

const fs   = require('fs');
const path = require('path');
const { httpsGet, unzip, backupAndWriteBinary } = require('./ghDownload');

// Where Zeal comes from (cfg.zealSource). 'official' is CoastalRedwood's latest
// release, everyone's default. 'test' is the guild's fork: its test-all branch
// (every tag branch merged onto the current Zeal), rebuilt on GitHub on every push
// into one rolling prerelease (the guild lead, 2026-10-01: "build the option into
// mimic to pull my zeal repo's build as an option"; fork workflow
// build-test-all.yml, DECISIONS §117). 'wolfpack' is the guild's tested build: the latest official
// release plus the few fixes the guild has run, one rolling prerelease (tag wolfpack-beta). Anything
// else reads as 'official'.
// 'zeal15' (the guild lead, 2026-11-08: "should be stable, then 1.5.0, then ours that are updated off of 1.5"):
// CoastalRedwood's newest 1.5.x release, alpha included. /releases/latest skips prereleases, so this reads the list
// (newest first) and takes the first v1.5 tag. Once 1.5.0 is final, Stable and this one land on the same build.
// The test-all build is rebased on 1.5 (fork, 2026-11-06), so Settings offers it as "Ours on 1.5"; the Wolf Pack build
// is still on the 1.4.x stable and is no longer offered, but a Mimic already set to it keeps getting it.
const ZEAL_SOURCES = {
  official: { api: 'https://api.github.com/repos/CoastalRedwood/Zeal/releases/latest' },
  zeal15:   { list: 'https://api.github.com/repos/CoastalRedwood/Zeal/releases?per_page=30', tag: /^v?1\.5\./i },
  test:     { api: 'https://api.github.com/repos/davehess/Zeal/releases/tags/test-all-build' },
  wolfpack: { api: 'https://api.github.com/repos/davehess/Zeal/releases/tags/wolfpack-beta' },
};
// The watch list (the guild lead, 2026-11-15, "Watch list" pick): saved sources beyond the built-in ones. Each is
// { id, label, repo: 'owner/name', mode: 'newest' | 'pinned' | 'pre', pin }. A source named 'w:<id>' picks from
// the saved list; an unknown id (a removed entry) reads as 'official', same as any unknown name.
const WATCH_MODES = ['newest', 'pinned', 'pre'];
const _REPO_RE = /^[A-Za-z0-9_.-]{1,64}\/[A-Za-z0-9_.-]{1,100}$/;
function cleanWatch(list) {
  const seen = new Set(), out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (!w || typeof w !== 'object') continue;
    const id = String(w.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const repo = String(w.repo || '').trim();
    if (!id || seen.has(id) || !_REPO_RE.test(repo)) continue;
    const mode = WATCH_MODES.includes(w.mode) ? w.mode : 'newest';
    const pin = String(w.pin || '').trim().slice(0, 80);
    if (mode === 'pinned' && !pin) continue;               // a pin with no tag names nothing
    seen.add(id);
    out.push({ id, label: String(w.label || repo).trim().slice(0, 60) || repo, repo, mode, pin });
  }
  return out.slice(0, 12);
}
function _zealSource(name, watch) {
  if (Object.prototype.hasOwnProperty.call(ZEAL_SOURCES, name)) return name;
  const m = /^w:(.+)$/.exec(String(name || ''));
  if (m && cleanWatch(watch).some(w => w.id === m[1])) return name;
  return 'official';
}

// Which release a watch-list entry takes, from a GitHub releases list. Pure (no network):
//   newest — the newest FINAL release (what /releases/latest returns)
//   pre    — the newest release of any kind, pre-releases included
//   pinned — exactly this tag ("v1.5.0" and "1.5.0" are the same pin); null when it is not there
// Drafts never count. "Newest" is by publish time, so a list that arrives in any order picks the same release.
function pickRelease(releases, { mode, pin } = {}) {
  const live = (Array.isArray(releases) ? releases : []).filter(r => r && !r.draft);
  const t = r => Date.parse(r.published_at || r.created_at || '') || 0;
  const byNew = live.map((r, i) => ({ r, i })).sort((a, b) => (t(b.r) - t(a.r)) || (a.i - b.i)).map(x => x.r);
  if (mode === 'pre') return byNew[0] || null;
  if (mode === 'pinned') {
    const want = String(pin || '').trim().replace(/^v/i, '').toLowerCase();
    return want ? (live.find(r => String(r.tag_name || '').replace(/^v/i, '').toLowerCase() === want) || null) : null;
  }
  return byNew.find(r => !r.prerelease) || null;
}

// The test release keeps one tag, so a build is named by its commit instead:
// "testall-<7 hex>", the label Zeal's own options window shows for it. The
// workflow names the release "test-all (<hash>)"; target_commitish is the
// fallback, then the asset's upload time, so a new build always reads as new.
function _testBuildTag(rel, zip) {
  const m = /\(([0-9a-f]{7,40})\)/i.exec(String((rel && rel.name) || ''));
  const commitish = String((rel && rel.target_commitish) || '');
  const sha = m ? m[1] : (/^[0-9a-f]{7,40}$/i.test(commitish) ? commitish : null);
  if (sha) return 'testall-' + sha.slice(0, 7).toLowerCase();
  return 'testall-' + String((zip && (zip.updated_at || zip.id)) || (rel && rel.published_at) || 'unknown');
}

// The Wolf Pack release also keeps one tag, so the build is named from the parentheses in the release
// name, "Wolf Pack Zeal beta (wolfpack-<run>-<sha>)" — exactly what `/zeal version` prints in game.
// Without them, the asset's upload time, so a new build always reads as new.
function _wolfpackBuildTag(rel, zip) {
  const m = /\((wolfpack-\d+-[0-9a-f]{7,40})\)/i.exec(String((rel && rel.name) || ''));
  if (m) return m[1].toLowerCase();
  return 'wolfpack-' + String((zip && (zip.updated_at || zip.id)) || (rel && rel.published_at) || 'unknown');
}

// Map a zip entry to its destination under the EQ client folder, or null to
// skip it. Handles both flat zips and zips nested under a top-level folder:
//   <anything>/Zeal.asi            → <eqDir>/Zeal.asi
//   <anything>/uifiles/<rest...>   → <eqDir>/uifiles/<rest...>
// Everything else (readme, license, loose extras) is intentionally ignored.
function _destFor(eqDir, entryName) {
  const parts = entryName.split(/[\\/]/).filter(Boolean);
  if (parts.some(p => p === '..')) return null;             // path-traversal guard
  const base = parts[parts.length - 1];
  const uiIdx = parts.findIndex(p => p.toLowerCase() === 'uifiles');
  if (uiIdx >= 0 && uiIdx < parts.length - 1) {
    // uifiles/default is the stock UI EverQuest itself ships. A Zeal zip must never overwrite it (the guild
    // lead, 2026-11-15, "defaultfix: Yes"): a changed stock skin is what a member's game falls back to.
    if (parts[uiIdx + 1].toLowerCase() === 'default' && uiIdx + 1 < parts.length - 1) return null;
    return path.join(eqDir, 'uifiles', ...parts.slice(uiIdx + 1));
  }
  if (base.toLowerCase() === 'zeal.asi' && uiIdx < 0) {
    return path.join(eqDir, 'Zeal.asi');
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

// Fetch the latest release metadata from `source` ('official' | 'zeal15' | 'test' | 'wolfpack'). Picks the
// zeal_v*.zip asset (falls back to any .zip). Network-only, no disk writes.
async function checkLatest(source, watch) {
  const src = _zealSource(source, watch);
  const w = src.startsWith('w:') ? cleanWatch(watch).find(x => 'w:' + x.id === src) : null;
  const def = w ? null : ZEAL_SOURCES[src];
  let rel;
  if (w) {
    const list = await httpsGet('https://api.github.com/repos/' + w.repo + '/releases?per_page=30', { json: true });
    rel = pickRelease(list, w);
    if (!rel) throw new Error(w.mode === 'pinned' ? 'no release tagged ' + w.pin + ' in ' + w.repo : 'no matching release in ' + w.repo);
  } else if (def.list) {
    const list = await httpsGet(def.list, { json: true });
    rel = (Array.isArray(list) ? list : []).find(r => r && !r.draft && def.tag.test(String(r.tag_name || '')));
    if (!rel) throw new Error('there is no Zeal 1.5 release yet');
  } else {
    rel = await httpsGet(def.api, { json: true });
  }
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const zip = assets.find(a => /^zeal_v.*\.zip$/i.test(a.name))
           || assets.find(a => /\.zip$/i.test(a.name));
  if (!zip || !zip.browser_download_url) {
    throw new Error(w ? w.repo + ' has no .zip on that release' : src === 'test' ? 'the Zeal test build has no .zip yet'
      : src === 'wolfpack' ? 'the Wolf Pack Zeal build has no .zip yet'
      : src === 'zeal15' ? 'the Zeal 1.5 release has no .zip yet'
      : 'latest Zeal release has no .zip asset');
  }
  return {
    source:      src,
    tag:         src === 'test' ? _testBuildTag(rel, zip)
               : src === 'wolfpack' ? _wolfpackBuildTag(rel, zip)
               : (rel.tag_name || null),
    name:        rel.name || rel.tag_name || null,
    htmlUrl:     rel.html_url || null,
    publishedAt: rel.published_at || null,
    assetName:   zip.name,
    assetUrl:    zip.browser_download_url,
    assetSize:   zip.size || 0,
  };
}

// Report what's installed locally, without touching the network.
//   installedTag — the tag we last installed (null if we never have / unknown)
//   hasZealAsi   — a Zeal.asi already sits in the folder (manual install, tag unknown)
function localStatus(eqDir, installedTag) {
  const dir = String(eqDir || '').trim();
  const hasZealAsi = !!dir && fs.existsSync(path.join(dir, 'Zeal.asi'));
  return { eqDir: dir || null, hasZealAsi, installedTag: installedTag || null };
}

// Download the release zip and install Zeal.asi + uifiles/ into eqDir, backing
// up every replaced file. Returns { ok, tag, written:[], backedUp:[] }.
// `release` may be passed in (from a prior checkLatest) to avoid a second fetch;
// otherwise `source` picks where to fetch from.
async function install(eqDir, { release, source, watch } = {}) {
  const dir = String(eqDir || '').trim();
  if (!dir) throw new Error('no EverQuest folder set');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error('EverQuest folder not found: ' + dir);
  }
  const rel = release || await checkLatest(source, watch);
  const buf = await httpsGet(rel.assetUrl, { json: false });
  const entries = unzip(buf);
  const written = [], backedUp = [];
  let installedAsi = false;
  for (const e of entries) {
    const dest = _destFor(dir, e.name);
    if (!dest) continue;
    const bak = backupAndWriteBinary(dest, e.data, 'zeal');
    written.push(path.relative(dir, dest));
    if (bak) backedUp.push(path.relative(dir, bak));
    if (path.basename(dest).toLowerCase() === 'zeal.asi') installedAsi = true;
  }
  if (!installedAsi) {
    throw new Error('release zip contained no Zeal.asi — nothing installed');
  }
  return { ok: true, tag: rel.tag, name: rel.name, written, backedUp };
}

module.exports = { pickRelease, cleanWatch, WATCH_MODES, checkLatest, localStatus, install, _destFor, ZEAL_SOURCES, _zealSource, _testBuildTag, _wolfpackBuildTag };
