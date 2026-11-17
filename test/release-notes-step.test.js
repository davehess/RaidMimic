// Runs release-mimic.yml's real "Build release notes" script against a throwaway git repo (DECISIONS §607, the guild
// lead's pick B, 2026-11-17): player notes or one title line above the ---, never a technical body; FB numbers and
// how to get Mimic below it; nothing about signing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = yamlLoad(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release-mimic.yml'), 'utf8'));
const SCRIPT = doc.jobs.build.steps.find((s) => /Build release notes/.test(s.name || '')).run;

let dir;
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
const commitMsg = (msg) => {
  fs.appendFileSync(path.join(dir, 'f.txt'), 'x\n');
  git('add', 'f.txt');
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-F', '-'], { cwd: dir, input: msg });
  return git('rev-parse', 'HEAD');
};
const run = (before) => {
  execFileSync('bash', ['-c', SCRIPT], { cwd: dir, env: { ...process.env, BEFORE: before ?? '', GITHUB_WORKSPACE: dir, GITHUB_REF: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
  return fs.readFileSync(path.join(dir, 'release-notes.md'), 'utf8');
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relnotes-'));
  git('init', '-q');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('release notes step', () => {
  it('uses the player-notes block and drops the technical body', () => {
    const base = commitMsg('start');
    commitMsg('agent v4.0.96 (beta) - colour back\n\nTechnical detail.\n- test/x.test.js (14)\n\n<!--player-notes-->\n- Colour is back on every On this PC page.\n<!--/player-notes-->\n\nFixes FB-49');
    const out = run(base);
    const [above, below] = out.split('\n---\n');
    expect(above.trim()).toBe('- Colour is back on every On this PC page.');
    expect(out).not.toMatch(/Technical detail|test\/x\.test\.js/);
    expect(below).toMatch(/^Fixes FB-49\./m);
    expect(below).toMatch(/New to Mimic\? Download Raid-Mimic-Setup below\. Already have it\? It updates itself\./);
  });

  it('without notes, shows only the newest non-sync title, never the body', () => {
    const base = commitMsg('start');
    commitMsg('mimic (beta) - Target Info distance in colour\n\n- mobinfo.html rangeZone() + paintRange');
    commitMsg('sync: beta -> alpha [sync]');
    const out = run(base);
    expect(out.split('\n---\n')[0].trim()).toBe('**mimic (beta) - Target Info distance in colour**');
    expect(out).not.toMatch(/rangeZone|sync:/);
  });

  it('finds notes and FB numbers anywhere in the push, deduped and in order', () => {
    const base = commitMsg('start');
    commitMsg('fix one\n\nFixes FB-12, FB-3 and FB-12');
    commitMsg('stable\n\n<!--player-notes-->\n- Two things.\n<!--/player-notes-->\n\nImplements: FB-7');
    commitMsg('docs - a note on top');
    const out = run(base);
    expect(out.split('\n---\n')[0].trim()).toBe('- Two things.');
    expect(out).toMatch(/Fixes FB-3, FB-7, FB-12\./);
  });

  it('a mention without a close word is not listed, and a manual run reads only the tip', () => {
    commitMsg('start\n\nFixes FB-1');
    commitMsg('see FB-2 for context');
    const out = run('');
    const [above, below] = out.split('\n---\n');
    expect(below).not.toMatch(/Fixes/);
    expect(above.trim()).toBe('**see FB-2 for context**');
  });

  it('never prints a signing line', () => {
    const base = commitMsg('start');
    commitMsg('x');
    expect(run(base)).not.toMatch(/code-signed|SmartScreen|Node runtime/);
  });
});
