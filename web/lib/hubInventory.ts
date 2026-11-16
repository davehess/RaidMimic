// Raid Mimic character page: a player's own Zeal `<Name>-Inventory.txt` (/output inventory) and `<Name>Quarmy.txt` files,
// read into rows for hub_inventory (supabase/migrations/20261115230000_hub_inventory.sql). The inventory file is read by
// the Wolf Pack parser (web/lib/inventoryFile.ts parseInventory, plain text in, rows out); the Quarmy file by the port
// below of the agent's parseQuarmyExport (packages/wolfpack-logsync/index.js), which drops bank, shared bank, coin and
// the cursor slot, so a Quarmy upload never carries them.
//
// Pure except through `InventoryDeps`, so the caps, the name rules and the keying are tested without a database
// (test/hub-inventory.test.js). Nothing here reads a Wolf Pack table. Everything is keyed on the session player's id,
// handed in by the caller, never read from a file or a URL; a file only says WHICH of that player's characters it is for.

import { NAME_RX, MAX_CHARACTERS_PER_PLAYER, normalizeText, claimRefusalText, type ImportDeps } from './hubImport';
import { decideClaim } from './hubClaim';
import { characterFromInventoryFilename, parseInventory, type ParsedInvRow } from './inventoryFile';

export const MAX_INV_FILE_BYTES = 192 * 1024;   // a full /output inventory with both banks is ~25 KB
export const MAX_INV_FILES = 20;
export const MAX_INV_LINES = 4000;
export const MAX_INV_ROWS = 600;                 // per file: worn 23 + bags 8x10 + bank + shared bank is ~250
export const MAX_ITEM_ID = 9_999_999;
export const MAX_QUANTITY = 1_000_000;

export type InvSource = 'inventory' | 'quarmy';
export type InvRow = { slot_label: string; item_id: number | null; item_name: string; quantity: number };
export type InvFile = { name: string; text: string; size: number };

export type ReadFile =
  | { ok: true; source: InvSource; character: string; rows: InvRow[] }
  | { ok: false; message: string };

const CONTROL_RX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** The agent's parseQuarmyExport, for the part a hub player's page shows: worn slots and bags. The character row's name
 *  comes back as `character` (the file's own name wins over its filename, like the agent). Ear/Wrist/Fingers appear twice
 *  and are numbered so each lands on its own row. */
export function parseQuarmy(text: string): { character: string | null; rows: InvRow[] } {
  const rows: InvRow[] = [];
  const slotSeen: Record<string, number> = {};
  const used = new Set<string>();
  let character: string | null = null;
  let section: 'inv' | 'aa' | null = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw) continue;
    const cols = raw.split('\t');
    const c0 = (cols[0] || '').trim();
    if (!c0) continue;
    if (c0 === 'Character') {
      if ((cols[1] || '').trim() !== 'Name') character = normalizeText(cols[1] || '') || character;
      continue;
    }
    if (c0 === 'Location') { section = 'inv'; continue; }
    if (c0 === 'AAIndex') { section = 'aa'; continue; }
    if (c0 === 'Checksum') { section = null; continue; }
    if (section !== 'inv') continue;
    // Bank, shared bank, currency and the cursor slot are not part of the gear view.
    if (/^(Bank|SharedBank)/i.test(c0) || /Coin/i.test(c0) || c0 === 'Held') continue;
    const itemName = normalizeText(cols[1] || '');
    const id = parseInt(cols[2], 10);
    if (!itemName || itemName.toLowerCase() === 'empty' || !Number.isFinite(id) || id <= 0) continue;
    let slot = c0;
    if (slot === 'Ear' || slot === 'Wrist' || slot === 'Fingers') {
      slotSeen[slot] = (slotSeen[slot] || 0) + 1;
      slot = slot + slotSeen[slot];
    }
    if (used.has(slot)) continue;
    used.add(slot);
    rows.push({ slot_label: slot, item_id: id, item_name: itemName, quantity: parseInt(cols[3], 10) || 1 });
  }
  return { character, rows };
}

/** One file → its source, the character it is for (letters only, 3 to 24, after the same text normalising the PoPFlags
 *  import uses, so a lookalike spelling is refused), and its rows with every field bounded. Caps are checked BEFORE the
 *  text is parsed. */
export function readInventoryFile(f: InvFile): ReadFile {
  if (f.size > MAX_INV_FILE_BYTES) return { ok: false, message: 'Larger than 192 KB, so it is not an inventory or Quarmy export.' };
  const text = String(f.text ?? '');
  if (CONTROL_RX.test(text)) return { ok: false, message: 'That does not look like a text export from EverQuest.' };
  if (text.split('\n').length > MAX_INV_LINES) return { ok: false, message: 'Too many lines for an inventory or Quarmy export.' };

  const quarmy = /quarmy/i.test(f.name) || /^Character\t/m.test(text);
  let source: InvSource;
  let name: string | null;
  let raw: ParsedInvRow[];
  if (quarmy) {
    const q = parseQuarmy(text);
    source = 'quarmy';
    const m = /^([A-Za-z]+)[-_ ]?Quarmy\.txt$/i.exec(String(f.name).split(/[\\/]/).pop() || '');
    name = q.character ?? (m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null);
    raw = q.rows;
  } else {
    source = 'inventory';
    name = characterFromInventoryFilename(f.name);
    raw = parseInventory(text);
  }
  const character = name ? normalizeText(name) : '';
  if (!NAME_RX.test(character)) {
    return { ok: false, message: quarmy
      ? 'Could not tell which character that Quarmy file is for (it needs a Character line, or a name like Name-Quarmy.txt).'
      : 'Could not tell which character that is. Keep the file name the game gave it, like Name-Inventory.txt.' };
  }
  if (raw.length === 0) return { ok: false, message: 'No items found in it.' };
  if (raw.length > MAX_INV_ROWS) return { ok: false, message: `More than ${MAX_INV_ROWS} items, which no character carries.` };

  const rows: InvRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const item_name = normalizeText(r.item_name).slice(0, 128);
    const slot_label = normalizeText(r.slot_label).slice(0, 64);
    if (!item_name || !slot_label || seen.has(slot_label)) continue;
    seen.add(slot_label);
    rows.push({
      slot_label, item_name,
      item_id: r.item_id !== null && r.item_id > 0 && r.item_id <= MAX_ITEM_ID ? r.item_id : null,
      quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(r.quantity) || 1)),
    });
  }
  if (rows.length === 0) return { ok: false, message: 'No items found in it.' };
  return { ok: true, source, character, rows };
}

// ── The import ───────────────────────────────────────────────────────────────

export type InvOutcome = { character: string; source: InvSource; items: number };
export type InvProblem = { file: string; message: string };
export type InvResult = { ok: true; saved: InvOutcome[]; problems: InvProblem[] } | { ok: false; error: string };

export type InventoryDeps = {
  /** The signed-in player. Every row written carries it; nothing in a file or a request can change it. */
  playerId: string;
  now: () => number;
  /** name_lc of every character this player already holds. null = could not read. */
  heldNames: () => Promise<string[] | null>;
  /** Replace this player's rows for one (character, source): write `rows`, drop that set's older rows. null = saved. */
  replace: (playerId: string, nameLc: string, character: string, source: InvSource, observedAt: string, rows: InvRow[]) => Promise<string | null>;
  // A file for a character the player does not hold yet starts it, by the same claim rule as a PoPFlags upload.
  discordId: string;
  wolfpackOwners: ImportDeps['wolfpackOwners'];
  holders: ImportDeps['holders'];
  insertCharacters: ImportDeps['insertCharacters'];
  flipContested: ImportDeps['flipContested'];
};

/** `only` (lower case name) is the character page's own form: a file for any other character is a problem, not a save. */
export async function importInventory(files: InvFile[], deps: InventoryDeps, only?: string): Promise<InvResult> {
  if (files.length === 0) return { ok: false, error: 'Choose one or more inventory or Quarmy files first.' };
  if (files.length > MAX_INV_FILES) return { ok: false, error: `Up to ${MAX_INV_FILES} files at a time.` };
  const problems: InvProblem[] = [];
  const picked = new Map<string, { character: string; source: InvSource; rows: InvRow[] }>();
  for (const f of files) {
    const label = String(f.name || 'file').slice(0, 80);
    const r = readInventoryFile(f);
    if (!r.ok) { problems.push({ file: label, message: r.message }); continue; }
    const lc = r.character.toLowerCase();
    if (only && lc !== only.toLowerCase()) { problems.push({ file: label, message: `That file is for ${r.character}, not this character.` }); continue; }
    picked.set(`${lc}|${r.source}`, { character: r.character, source: r.source, rows: r.rows });   // the later file wins
  }
  if (picked.size === 0) return { ok: true, saved: [], problems };

  const held = await deps.heldNames();
  if (!held) return { ok: false, error: 'Could not save just now. Try again in a minute.' };
  const heldSet = new Set(held);
  const observedAt = new Date(deps.now()).toISOString();
  const saved: InvOutcome[] = [];

  // A character not held yet: the cap, then the claim rule, once per name (an inventory and a Quarmy file share one).
  const fresh = new Map<string, string>();
  for (const [key, v] of picked) { const lc = key.split('|')[0]; if (!heldSet.has(lc) && !fresh.has(lc)) fresh.set(lc, v.character); }
  const refused = new Map<string, string>();
  const claimed: { lc: string; name: string; proof: string }[] = [];
  if (fresh.size) {
    let slots = Math.max(0, MAX_CHARACTERS_PER_PLAYER - heldSet.size);
    const candidates: string[] = [];
    for (const [lc] of fresh) {
      if (slots > 0) { slots--; candidates.push(lc); }
      else refused.set(lc, `You already have ${MAX_CHARACTERS_PER_PLAYER} characters, the most one player can load.`);
    }
    if (candidates.length) {
      const owners = await deps.wolfpackOwners(candidates);
      const holders = await deps.holders(candidates);
      if (!owners || !holders) return { ok: false, error: 'Could not save just now. Try again in a minute.' };
      for (const lc of candidates) {
        const v = decideClaim({ playerId: deps.playerId, discordId: deps.discordId, wolfpackDiscordId: owners.get(lc), holders: holders.get(lc) });
        if (v.verdict === 'refused') refused.set(lc, claimRefusalText(v.reason));
        else claimed.push({ lc, name: fresh.get(lc)!, proof: v.verdict === 'contested' ? 'contested' : 'claimed' });
      }
    }
    if (claimed.length) {
      const err = await deps.insertCharacters(claimed.map(c => ({ player_id: deps.playerId, name: c.name, name_lc: c.lc, proof: c.proof })));
      if (err) return { ok: false, error: 'Could not save just now. Try again in a minute.' };
      const contested = claimed.filter(c => c.proof === 'contested').map(c => c.lc);
      if (contested.length && await deps.flipContested(contested)) return { ok: false, error: 'Could not save just now. Try again in a minute.' };
    }
  }
  const claimedSet = new Set(claimed.map(c => c.lc));

  for (const [key, v] of picked) {
    const lc = key.split('|')[0];
    if (!heldSet.has(lc) && !claimedSet.has(lc)) {
      problems.push({ file: v.character, message: refused.get(lc) ?? 'Could not add this character.' });
      continue;
    }
    const err = await deps.replace(deps.playerId, lc, v.character, v.source, observedAt, v.rows);
    if (err) return { ok: false, error: 'Could not save just now. Try again in a minute.' };
    saved.push({ character: v.character, source: v.source, items: v.rows.length });
  }
  return { ok: true, saved, problems };
}
