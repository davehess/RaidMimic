// The midnight parse consolidation took its two helpers from commands/parsestats.js, which does not export them, so it
// threw "groupKillsBySession is not a function" every night (found in Railway's error lines, 2026-11-16).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readSource, stripJs, BOT_INDEX } from './_source-slice.js';

const require = createRequire(import.meta.url);

describe('midnight consolidation helpers', () => {
  it('commands/parse.js exports both helpers as functions', () => {
    const parse = require('../commands/parse.js');
    expect(typeof parse.groupKillsBySession).toBe('function');
    expect(typeof parse.mergeKillGroup).toBe('function');
  });
  it('index.js takes them from commands/parse, not commands/parsestats', () => {
    const src = stripJs(readSource(BOT_INDEX));
    expect(src).toMatch(/\{\s*groupKillsBySession,\s*mergeKillGroup\s*\}\s*=\s*require\('\.\/commands\/parse'\)/);
    expect(src).not.toMatch(/groupKillsBySession[^\n]*require\('\.\/commands\/parsestats'\)/);
  });
});
