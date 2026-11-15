// test/ui-dragitems.test.js — a custom UI's EQUI_Animations.xml must declare every dragitemNN.tga sheet the default
// does, in BOTH the TextureInfo section and the A_DragItem animation (a member, 2026-11-15: items on a newer sheet drew
// as a pearl necklace). Runs the real apps/mimic/uiDragItems.js on fixtures hand-written in the stock file's format
// (tabs, `item = "…"` with spaces, one Frames block per sheet).
// Run: npx vitest run test/ui-dragitems.test.js
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { ROOT, stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const { check, fix } = require('../apps/mimic/uiDragItems.js');

const tex = (n) => `\t<TextureInfo item = "dragitem${n}.tga">\n\t\t<Size>\n\t\t\t<CX>256</CX>\n\t\t\t<CY>256</CY>\n\t\t</Size>\n\t</TextureInfo>\n`;
const frame = (n) => `\t\t<Frames>\n\t\t\t<Texture>dragitem${n}.tga</Texture>\n\t\t\t<Location>\n\t\t\t\t<X>0</X>\n\t\t\t\t<Y>0</Y>\n\t\t\t</Location>\n\t\t\t<Size>\n\t\t\t\t<CX>256</CX>\n\t\t\t\t<CY>256</CY>\n\t\t\t</Size>\n\t\t\t<Duration>1000</Duration>\n\t\t</Frames>\n`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// texN / frameN: which sheets each section lists.
function file(texN, frameN) {
  return '<?xml version = "1.0"?>\n<XML ID = "EQInterfaceDefinitionLanguage">\n\t<Schema xmlns = "EverQuestData"/>\n' +
    '\t<TextureInfo item = "CS_Buttons.bmp">\n\t\t<Size>\n\t\t\t<CX>256</CX>\n\t\t</Size>\n\t</TextureInfo>\n' +
    texN.map(tex).join('') +
    '\t<TextureInfo item = "window_pieces01.tga">\n\t\t<Size>\n\t\t\t<CX>128</CX>\n\t\t</Size>\n\t</TextureInfo>\n' +
    '\t<Ui2DAnimation item = "A_Other">\n\t\t<Frames>\n\t\t\t<Texture>window_pieces01.tga</Texture>\n\t\t</Frames>\n\t</Ui2DAnimation>\n' +
    '<!-- drag items -->\n\t<Ui2DAnimation item = "A_DragItem">\n\t\t<Cycle>false</Cycle>\n\t\t<Grid>true</Grid>\n' +
    frameN.map(frame).join('') + '\t</Ui2DAnimation>\n' +
    '\t<Ui2DAnimation item = "A_Tail">\n\t\t<Cycle>true</Cycle>\n\t</Ui2DAnimation>\n</XML>\n';
}
const DEF = file(range(1, 34), range(1, 34));
const crlf = (s) => s.replace(/\n/g, '\r\n');

describe('check', () => {
  it('a custom file that stops at 22 lacks 23..34 in both sections', () => {
    const r = check(file(range(1, 22), range(1, 22)), DEF);
    expect(r.status).toBe('missing');
    expect(r.missing.map(m => m.n)).toEqual(range(23, 34));
    expect(r.missing.every(m => m.texture && m.animation)).toBe(true);
  });
  it('a sheet missing only its texture entry is reported as texture-only', () => {
    const r = check(file(range(1, 33), range(1, 34)), DEF);
    expect(r.missing).toEqual([{ n: 34, texture: true, animation: false }]);
  });
  it('a sheet missing only its animation frame is reported as animation-only', () => {
    const r = check(file(range(1, 34), range(1, 33)), DEF);
    expect(r.missing).toEqual([{ n: 34, texture: false, animation: true }]);
  });
  it('a complete file is ok, and one with extra sheets is too', () => {
    expect(check(DEF, DEF).status).toBe('ok');
    expect(check(file(range(1, 40), range(1, 40)), DEF).status).toBe('ok');
  });
  it('a file that declares no sheets at all is not ours to fix', () => {
    const bare = '<XML ID = "x">\n\t<Ui2DAnimation item = "A_Tail">\n\t</Ui2DAnimation>\n</XML>\n';
    expect(check(bare, DEF).status).toBe('nothing');
  });
});

describe('fix', () => {
  it('copies the missing blocks so the result passes check and matches the default\'s sheet list', () => {
    const cus = file(range(1, 22), range(1, 22));
    const r = fix(cus, DEF);
    expect(r.changed).toBe(true);
    expect(check(r.text, DEF).status).toBe('ok');
    // Same file a complete UI would have: blocks landed in the same parents and in sheet order.
    expect(r.text).toBe(DEF);
  });
  it('fixes a texture-only gap and an animation-only gap, each in its own section', () => {
    const t = fix(file(range(1, 33), range(1, 34)), DEF);
    expect(t.text).toBe(DEF);
    const a = fix(file(range(1, 34), range(1, 33)), DEF);
    expect(a.text).toBe(DEF);
  });
  it('inserts a sheet missing from the middle in order (a frame\'s position is its sheet)', () => {
    const r = fix(file([...range(1, 10), ...range(12, 34)], [...range(1, 10), ...range(12, 34)]), DEF);
    expect(r.text).toBe(DEF);
  });
  it('keeps CRLF line endings and every other byte', () => {
    const cus = crlf(file(range(1, 22), range(1, 22)));
    const r = fix(cus, DEF);
    expect(r.changed).toBe(true);
    expect(r.text).toBe(crlf(DEF));
    expect(/[^\r]\n/.test(r.text)).toBe(false);
  });
  it('is idempotent', () => {
    const once = fix(file(range(1, 22), range(1, 22)), DEF);
    const twice = fix(once.text, DEF);
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
  });
  it('never touches non-DragItem entries', () => {
    const cus = file(range(1, 22), range(1, 22)).replace('<CX>128</CX>', '<CX>999</CX>').replace('<Cycle>true</Cycle>', '<Cycle>CUSTOM</Cycle>');
    const r = fix(cus, DEF);
    expect(r.text).toContain('<CX>999</CX>');
    expect(r.text).toContain('<Cycle>CUSTOM</Cycle>');
    expect(r.text).toContain('window_pieces01.tga');
    // Only DragItem blocks differ: strip them from both and the rest is identical.
    const strip = (s) => s.replace(/[ \t]*<TextureInfo\s+item\s*=\s*"dragitem\d+\.tga"\s*>[\s\S]*?<\/TextureInfo>\n/g, '')
      .replace(/[ \t]*<Frames>\s*<Texture>dragitem\d+\.tga<\/Texture>[\s\S]*?<\/Frames>\n/g, '');
    expect(strip(r.text)).toBe(strip(cus));
  });
  it('leaves a malformed file alone and says why', () => {
    const broken = file(range(1, 22), range(1, 22)).replace('</Ui2DAnimation>\n\t<Ui2DAnimation item = "A_Tail">', '\n\t<Ui2DAnimation item = "A_Tail">');
    const r = fix(broken, DEF);
    expect(r.status).toBe('malformed');
    expect(r.changed).toBe(false);
    expect(r.text).toBe(broken);
    expect(r.message).toMatch(/Ui2DAnimation/);
    expect(r.message).toMatch(/left it alone/);
    expect(fix('not xml at all', DEF).status).toBe('malformed');
    expect(fix(file(range(1, 22), range(1, 22)), 'junk').status).toBe('malformed');
  });
  it('a custom file with sheet textures but no A_DragItem animation is left alone', () => {
    const noAnim = file(range(1, 22), range(1, 22)).replace(/<Ui2DAnimation item = "A_DragItem">[\s\S]*?<\/Ui2DAnimation>\n/, '');
    const r = fix(noAnim, DEF);
    expect(r.status).toBe('malformed');
    expect(r.text).toBe(noAnim);
  });
});

describe('wiring', () => {
  const main = stripJs(fs.readFileSync(path.join(ROOT, 'apps', 'mimic', 'main.js'), 'utf8'));
  it('the fix keeps a dated copy before it writes, and never copies TGAs', () => {
    const i = main.indexOf("ipcMain.handle('ui-icon-sheets-fix'");
    const block = main.slice(i, main.indexOf("ipcMain.handle('mimic-link-start'"));
    expect(block).toMatch(/backupAndWriteBinary\(/);
    expect(block).not.toMatch(/copyFile|\.tga/i);
  });
  it('Settings exposes the notice and the fix', () => {
    const html = fs.readFileSync(path.join(ROOT, 'apps', 'mimic', 'settings.html'), 'utf8');
    expect(html).toContain('uiIconSheetsFix');
    expect(html).toContain('/loadskin');
  });
});
