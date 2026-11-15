// uiDragItems.js — find and repair missing item-icon sheets in a custom UI's EQUI_Animations.xml.
//
// Why (a member, 2026-11-15): EverQuest reads EQUI_Animations.xml from the custom UI folder
// (uifiles/<skin>/) INSTEAD of uifiles/default/. Item icons come from dragitemNN.tga sheets (icons start at
// 500, 36 per sheet, 6x6 cells of 40px, so icon N is on sheet floor((N-500)/36)+1), and each sheet has to be
// declared in TWO places in that file:
//   1. a texture entry:   <TextureInfo item = "dragitem25.tga"> <Size><CX>256</CX><CY>256</CY></Size> </TextureInfo>
//   2. a frame inside the one animation that cuts the sheets into icon cells:
//        <Ui2DAnimation item = "A_DragItem"> <Grid>true</Grid> … <Frames><Texture>dragitem25.tga</Texture>…</Frames> …
// A UI built for an older client stops at dragitem22. A sheet declared in only one place gives no error: the
// client just draws the fallback icon (the pearl necklace). Source of the structure: the stock client's
// uifiles/default/EQUI_Animations.xml (EQMacEmu/Server utils/UI/PC/UIFiles/default, one TextureInfo per sheet
// near the top, one A_DragItem animation holding one Frames block per sheet, in sheet order — a frame's POSITION
// is its sheet number, so a missing frame is inserted in order, never appended out of order).
//
// Pure: text in, text out. No fs, no Electron. Every other entry in the file is left byte-for-byte alone, the
// file's own line endings are kept, and only DragItem blocks are ever copied.

const TEX_RX   = /[ \t]*<TextureInfo\s+item\s*=\s*"dragitem(\d+)\.tga"\s*>[\s\S]*?<\/TextureInfo>[ \t]*(?:\r?\n)?/gi;
const ANIM_RX  = /<Ui2DAnimation\s+item\s*=\s*"A_DragItem"\s*>[\s\S]*?<\/Ui2DAnimation>/i;
const FRAME_RX = /[ \t]*<Frames>[\s\S]*?<\/Frames>[ \t]*(?:\r?\n)?/gi;
const FRAME_TEX_RX = /<Texture>\s*dragitem(\d+)\.tga\s*<\/Texture>/i;

function _count(text, rx) { return (text.match(rx) || []).length; }

// A file we will not edit: a tag opened and never closed means a regex copy could land in the wrong place.
function _malformed(text, label) {
  if (typeof text !== 'string' || !text.trim()) return `${label} is empty`;
  const pairs = [['<XML\\b', '</XML>', 'XML'], ['<TextureInfo\\b', '</TextureInfo>', 'TextureInfo'],
    ['<Ui2DAnimation\\b', '</Ui2DAnimation>', 'Ui2DAnimation'], ['<Frames>', '</Frames>', 'Frames']];
  for (const [open, close, name] of pairs) {
    const o = _count(text, new RegExp(open, 'gi')), c = _count(text, new RegExp(close.replace('/', '\\/'), 'gi'));
    if (o !== c) return `${label} has ${o} <${name}> but ${c} </${name}>`;
    if (name === 'XML' && !o) return `${label} has no <XML> element`;
  }
  return null;
}

// Where each sheet is declared: { textures: Map(n -> {start,end,text}), frames: Map(n -> {...}), anim: {start,end} | null }
function _scan(text) {
  const textures = new Map(), frames = new Map();
  for (const m of text.matchAll(TEX_RX)) textures.set(Number(m[1]), { start: m.index, end: m.index + m[0].length, text: m[0] });
  const am = ANIM_RX.exec(text);
  let anim = null;
  if (am) {
    anim = { start: am.index, end: am.index + am[0].length };
    for (const f of am[0].matchAll(FRAME_RX)) {
      const t = FRAME_TEX_RX.exec(f[0]);
      if (t) frames.set(Number(t[1]), { start: am.index + f.index, end: am.index + f.index + f[0].length, text: f[0] });
    }
  }
  return { textures, frames, anim };
}

const _eolOf = (text) => (text.indexOf('\r\n') >= 0 ? '\r\n' : '\n');
const _withEol = (block, eol) => block.replace(/\r?\n/g, eol);
const _sorted = (map) => [...map.keys()].sort((a, b) => a - b);

// What the default declares that the custom file lacks.
// -> { status: 'ok'|'missing'|'nothing'|'malformed', missing: [{ n, texture, animation }], message }
//    texture/animation say which section LACKS the sheet. 'nothing' = the custom file is not ours to fix.
function check(customXml, defaultXml) {
  const bad = _malformed(customXml, 'The custom EQUI_Animations.xml') || _malformed(defaultXml, 'The default EQUI_Animations.xml');
  if (bad) return { status: 'malformed', missing: [], message: `${bad}, so Mimic left it alone.` };
  const def = _scan(defaultXml), cus = _scan(customXml);
  if (!def.anim || !def.frames.size || !def.textures.size)
    return { status: 'malformed', missing: [], message: 'The default EQUI_Animations.xml has no item-icon sheets Mimic can read, so it left the custom one alone.' };
  if (!cus.anim && !cus.textures.size)
    return { status: 'nothing', missing: [], message: 'This custom UI declares no item-icon sheets of its own, so there is nothing to copy into.' };
  if (!cus.anim)
    return { status: 'malformed', missing: [], message: 'The custom EQUI_Animations.xml lists item-icon sheets but has no A_DragItem animation, so Mimic left it alone.' };
  const missing = [];
  for (const n of _sorted(new Map([...def.textures, ...def.frames]))) {
    const texture = def.textures.has(n) && !cus.textures.has(n);
    const animation = def.frames.has(n) && !cus.frames.has(n);
    if (texture || animation) missing.push({ n, texture, animation });
  }
  if (!missing.length) return { status: 'ok', missing, message: 'Every item-icon sheet is declared.' };
  return { status: 'missing', missing, message: `${missing.length} item-icon sheet${missing.length === 1 ? ' is' : 's are'} missing: ${missing.map(m => m.n).join(', ')}.` };
}

// Copy the missing default blocks into the custom text. -> check()'s fields plus { changed, text }.
// text is the input untouched unless status is 'missing'.
function fix(customXml, defaultXml) {
  const r = check(customXml, defaultXml);
  if (r.status !== 'missing') return { ...r, changed: false, text: customXml };
  const eol = _eolOf(customXml);
  const def = _scan(defaultXml), cus = _scan(customXml);
  const edits = [];   // { pos, text }
  // One insertion per missing block: before the first block with a higher sheet number, else after the last.
  const place = (cusMap, n, block, fallbackPos) => {
    const higher = _sorted(cusMap).find(k => k > n);
    let pos, prefix = '';
    if (higher !== undefined) pos = cusMap.get(higher).start;
    else if (cusMap.size) {
      const last = cusMap.get(_sorted(cusMap).pop());
      pos = last.end;
      if (!/\n$/.test(last.text)) prefix = eol;
    } else pos = fallbackPos;
    edits.push({ pos, n, text: prefix + _withEol(block, eol) });
  };
  for (const m of r.missing) {
    if (m.texture) place(cus.textures, m.n, _ensureNl(def.textures.get(m.n).text), cus.anim.start);
    if (m.animation) {
      // With no frames yet, go at the start of the line holding the animation's closing tag.
      const closeLine = customXml.lastIndexOf('\n', cus.anim.end - 1) + 1;
      place(cus.frames, m.n, _ensureNl(def.frames.get(m.n).text), Math.max(closeLine, cus.anim.start));
    }
  }
  // Same position: keep sheet order. Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => (b.pos - a.pos) || (b.n - a.n));
  let text = customXml;
  for (const e of edits) text = text.slice(0, e.pos) + e.text + text.slice(e.pos);
  const after = check(text, defaultXml);
  if (after.status !== 'ok') return { ...r, status: 'malformed', changed: false, text: customXml, message: 'Mimic could not place the missing sheets safely, so it left the file alone.' };
  return { ...r, changed: true, text, message: `Added ${r.missing.length} item-icon sheet${r.missing.length === 1 ? '' : 's'}: ${r.missing.map(m => m.n).join(', ')}.` };
}
function _ensureNl(s) { return /\n$/.test(s) ? s : s + '\n'; }

module.exports = { check, fix };
