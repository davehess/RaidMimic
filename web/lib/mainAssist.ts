// The main assist, read from raid chat, for the replay's "MA" marker. A PORT of utils/mainAssist.js's
// parseDeclaration (same shapes, same name rules, same caps): test/replay-me-ma-heals.test.js runs both on shared
// lines and fails when they disagree. Change the rules in the bot first, then here.
//
// What the replay does with it: the declaration holds from the moment it was said until a newer one, for DECL_TTL_MS
// (the bot's own hold). One raid is assumed, as the bot does when the raid has not been split ('_'); a night with two
// raids running at once takes the newest declaration for both.

const NAME = '([A-Za-z]{3,15})';
const MA = '(?:MA|main\\s*assist)';
const SHAPES = [
  new RegExp(`^(?:new\\s+)?${MA}\\s*(?:is|=|:|->|→|-)?\\s*${NAME}\\b`, 'i'),
  new RegExp(`^(?:the\\s+)?${MA}\\s+(?:is\\s+)?(?:now\\s+)?${NAME}\\b`, 'i'),
  new RegExp(`\\b${NAME}\\s+(?:is|=)\\s+(?:the\\s+|now\\s+)?${MA}\\b`, 'i'),
  new RegExp(`^/?assist\\s+${NAME}\\s*[.!]?$`, 'i'),
];
const SELF = /^(?:assist\s+me\b|i\s*(?:am|'m|m)\s+(?:the\s+)?(?:MA|main\s*assist)\b)/i;
const NOT_NAMES = new Set(['the', 'him', 'her', 'them', 'you', 'me', 'now', 'next', 'here', 'there', 'tank', 'off', 'and', 'for', 'pet']);

/** The bot's own prefilter on a raid-chat line (index.js, before parseDeclaration). */
export const MA_LINE = /\b(?:ma|main\s*assist|assist)\b/i;
/** A declaration holds for the night (the bot: 6 hours). */
export const DECL_TTL_MS = 6 * 3600_000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** A raid-chat line -> the declared main assist's name, or null. `isPlayer` gets the lower-case name. */
export function parseMaDeclaration(text: string, speaker: string, isPlayer?: (lower: string) => boolean): string | null {
  const t = String(text || '').trim();
  if (!t || t.length > 120) return null;
  const sp = String(speaker || '').trim();
  if (SELF.test(t)) return sp ? cap(sp) : null;
  for (const rx of SHAPES) {
    const m = rx.exec(t);
    if (!m) continue;
    const n = m[1];
    if (NOT_NAMES.has(n.toLowerCase())) continue;
    if (typeof isPlayer === 'function' && !isPlayer(n.toLowerCase())) continue;
    return cap(n);
  }
  return null;
}

export type MaDecl = { t: number; name: string };   // t: epoch ms

/** The main assist at moment `t`: the newest declaration at or before it, still inside the hold. `decls` is sorted by t. */
export function maAt(decls: readonly MaDecl[], t: number): string | null {
  let lo = 0, hi = decls.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (decls[mid].t <= t) lo = mid + 1; else hi = mid; }
  const d = lo > 0 ? decls[lo - 1] : null;
  return d && t - d.t <= DECL_TTL_MS ? d.name : null;
}

/** Folds a window's wire declarations (`[ms, name]`) into the running list: deduped, sorted. */
export function mergeDecls(into: MaDecl[], wire: unknown): void {
  if (!Array.isArray(wire)) return;
  for (const w of wire) {
    if (!Array.isArray(w) || typeof w[0] !== 'number' || typeof w[1] !== 'string') continue;
    if (!into.some(d => d.t === w[0] && d.name === w[1])) into.push({ t: w[0], name: w[1] });
  }
  into.sort((a, b) => a.t - b.t);
}
