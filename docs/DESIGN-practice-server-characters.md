# Practice servers anyone can run, with your character brought in whole

Status: **design, awaiting a pick** (Decision Desk card "Practice servers: how a character comes over", DECISIONS §586).
Context: a member has stood up a practice server for the guild. The ask (the guild lead, 2026-11-15): *"we need a system
for others to continue as well. could Quarm exist p2p or accept the export files directly or a new all encompassing
format? bring in all items, skills, factions, etc"*. Research: server source SecretsOTheP/EQMacEmu at `c2cd265`
(player tables from the dump `quarm_2026-10-25-22_33`), Zeal at `8fc71cc`.

## Answers

- **Peer-to-peer: no.** Login, world and zone are authoritative server processes; the client is a thin UDP client to
  them. "Others can continue" means a **packaged server** any member can stand up, not a shared one.
- **The server cannot read export files.** It knows only its own tables. A converter turns the files into rows for
  those tables, which is the same thing in practice.
- **A new format is not needed to start.** Zeal's own export (`/outputfile quarmy`, also written on camp with
  `ExportOnCamp`) already carries almost everything the server needs.

## The packaged server

The Quarm repo documents the recipe: MariaDB 10.3, import the dated content dump shipped in the repo
(`utils/sql/database_full/*.tar.gz`), run the EQMacDocker compose, add quests (SecretsOTheP/quests) and maps. A content
upgrade wipes content tables but keeps player tables, so characters survive it. Our `/test-server` proposal page
(https://wolfpack.quest/test-server) estimates ~$10-30/mo on a small VPS. Players use the TAKP client with Quarm's DLL and
point `eqhost.txt` at the server's login server. To write as a runbook once the member's stand-up is confirmed.

## What a character is on the server, and where each part can come from

Every per-character table is keyed by `character_data.id`, so a character can be inserted by SQL while the server is
down, as long as `character_data.account_id` points at an existing `account` row.

| Server table | Source | When there is none |
|---|---|---|
| `character_data` | Zeal export `Character` row: name, level, class, race, gender, deity, base stats | exp at the level floor, a safe zone, hp/mana from base data |
| `character_inventory` (worn, bags, cursor, bank, bank bags) | Zeal export location table, read on the player's own PC | — |
| `account_inventory` (shared bank, per account) | the export's SharedBank rows | empty |
| `character_currency` | the export's coin rows | 0 |
| `character_spells` | `<Name>-Spellbook.txt` | — |
| `character_memmed_spells` | not exported | empty gems |
| `character_alternate_abilities` | export `AAIndex/Rank` (client index → server `aa_id` mapping to confirm) | — |
| `character_skills` | tradeskills from the export; combat skills are NOT exported | class/level cap from `skill_caps` |
| `character_languages` | not exported | race defaults |
| `character_faction_values` | not available to the client at all | server defaults |
| `character_zone_flags`, `character_keyring` | Zeal `popflags` export, our `character_keys` | empty |
| `character_bind` | none | a safe bind |

Our agent drops bank, shared bank, coin and the cursor from the Quarmy file on purpose (they never leave the PC), and
ignores the skills table. A converter that runs **on the player's own PC** reads the full file and nothing private is
uploaded.

## Options (the pick)

- **A — Zeal's export is the format.** Mimic gets "Bring to a practice server": it reads the player's local Quarmy and
  Spellbook files and writes one `.sql` file for the server owner to import. Combat skills at the class cap, the rest
  defaulted. Smallest; can grow into B.
- **B — Our own versioned bundle.** A JSON file per character, each field marked with its source, built from the local
  files plus what wolfpack.quest knows (keys, flags); an importer writes it into any compatible server. Leaves room for
  skills and factions when a source appears; a second format to maintain.
- **C — A plus a fuller Zeal export.** Extend Zeal's export (our fork) with every skill, languages and spell gems, so skills
  come over exact. Most complete; needs a Zeal change and players on that build. Factions stay server-only either way.

Recommended: **A now**, the converter shaped so its output can become B's bundle later; C only if capped skills matter
in practice.

## Open before building

- How the server creates the `account` row on a first login, on a real stand-up.
- The Quarm client's AA index → server `aa_id` mapping.
- Exact numeric worn and general slot ids from `common/patches/mac_limits.h`.
- Whether the server owner wants bank and coin brought over (a practice server may prefer gear only).
