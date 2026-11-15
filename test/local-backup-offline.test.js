// Offline backups (Mimic): a kept copy on this PC holds the UI files whole plus the overlay layout, a restore never
// writes the layout into the EQ folder, only the newest N are kept, and an unchanged state is not a new version.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lv = require('../apps/mimic/localVersions.js');
const overlayBackup = require('../apps/mimic/overlayBackup.js');
const { filterRestorable } = require('../apps/mimic/uiRestoreGuard.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'localbk-'));
const bundle = () => ({
  'UI_Aldenmar_pq.proj.ini': '[Main]\nX=1\n',
  'eqclient.ini': '[Defaults]\nWindowedMode=FALSE\nChannelAutoJoin1=guild,hunter2\n[VideoMode]\nWidth=1920\n',
});
const layout = () => overlayBackup.build({ rects: { hudBounds: { x: 1, y: 2, width: 300, height: 200 } }, flags: { showHud: true }, now: 1 });

describe('offline backup contents', () => {
  it('carries the overlay layout, and a restore writes only the .ini files', () => {
    const files = { ...bundle(), [overlayBackup.FILE]: layout() };
    const parsed = overlayBackup.parse(files[overlayBackup.FILE]);
    expect(parsed.rects.hudBounds.width).toBe(300);
    const { files: written, skipped } = filterRestorable(files);
    expect(skipped).toEqual([overlayBackup.FILE]);
    expect(Object.keys(written).sort()).toEqual(['UI_Aldenmar_pq.proj.ini', 'eqclient.ini']);
  });

  it('round-trips through a kept version, and an unchanged state is not a new version', () => {
    const root = tmp();
    const files = { ...bundle(), [overlayBackup.FILE]: layout() };
    const a = lv.snapshot(root, 'Aldenmar', files, new Date(2026, 0, 1, 10, 0, 0), 10, { source: 'manual' });
    expect(a.created).toBe(true);
    const b = lv.snapshot(root, 'Aldenmar', files, new Date(2026, 0, 1, 10, 5, 0), 10, { source: 'manual' });
    expect(b.created).toBe(false);
    expect(lv.listVersions(root, 'Aldenmar')).toHaveLength(1);
    expect(lv.readVersion(root, 'Aldenmar', a.id)[overlayBackup.FILE]).toBe(layout());
  });
});

describe('offline backup retention', () => {
  it('keeps only the newest N versions per character', () => {
    const root = tmp();
    for (let i = 0; i < 14; i++) {
      lv.snapshot(root, 'Brackwyn', { 'UI_Brackwyn_pq.proj.ini': 'v=' + i }, new Date(2026, 0, 1, 10, i, 0), 10);
    }
    const list = lv.listVersions(root, 'Brackwyn');
    expect(list).toHaveLength(10);
    expect(lv.readVersion(root, 'Brackwyn', list[0].id)['UI_Brackwyn_pq.proj.ini']).toBe('v=13');
    expect(lv.readVersion(root, 'Brackwyn', list[9].id)['UI_Brackwyn_pq.proj.ini']).toBe('v=4');
  });

  it('prunes one character without touching another', () => {
    const root = tmp();
    lv.snapshot(root, 'Corvale', { 'a.ini': '1' }, new Date(2026, 0, 1, 9, 0, 0), 3);
    for (let i = 0; i < 5; i++) lv.snapshot(root, 'Rethlan', { 'a.ini': String(i) }, new Date(2026, 0, 1, 10, i, 0), 3);
    expect(lv.listVersions(root, 'Rethlan')).toHaveLength(3);
    expect(lv.listVersions(root, 'Corvale')).toHaveLength(1);
  });
});
