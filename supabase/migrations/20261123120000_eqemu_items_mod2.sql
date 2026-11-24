-- 20261123120000_eqemu_items_mod2.sql
-- "mod2" item stats from Quarm's 2026-11-23 patch. Source: SecretsOTheP/EQMacEmu commit 7d54c5a,
-- utils/sql/git/required/2026_11_18_items_mod2_stats.sql (caps in common/ruletypes.h: strikethrough 35,
-- stunresist 35, combateffects 100, accuracy 150, avoidance 100, spellshield 35, shielding 35, damageshield 30).
-- Seven new columns on eqemu_items, then the 63 seed rows the upstream file sets (same ids and values).
-- damageshield already exists on eqemu_items, so Shroud of Eternity's value goes through it.
-- The upstream worneffect swap for Shroud of Eternity is deliberately not mirrored here.
-- The weekly sync (scripts/sync-from-eqmac.js) keeps the columns current afterwards. Idempotent.

alter table public.eqemu_items
  add column if not exists strikethrough smallint not null default 0,
  add column if not exists stunresist    smallint not null default 0,
  add column if not exists combateffects smallint not null default 0,
  add column if not exists accuracy      smallint not null default 0,
  add column if not exists avoidance     smallint not null default 0,
  add column if not exists spellshield   smallint not null default 0,
  add column if not exists shielding     smallint not null default 0;

update public.eqemu_items set strikethrough = 5 where id = 27990; -- Gauntlets of Disruption (P2 - Minis)
update public.eqemu_items set stunresist = 5 where id = 21994; -- Protective Sleeves (P3 - Minis)
update public.eqemu_items set combateffects = 5 where id = 5760; -- Earring of Xaoth Kor (P3 - Rockmen)
update public.eqemu_items set accuracy = 10 where id = 29174; -- Mask of Strategic Insight (P3 - Rockmen)
update public.eqemu_items set stunresist = 5 where id = 20898; -- Symbol of the Planemasters (P4 - Saryrn)
update public.eqemu_items set avoidance = 10 where id = 26994; -- Ring of Evasion (P4 - Saryrn)
update public.eqemu_items set spellshield = 4 where id = 26996; -- Gloves of the Unseen (P4 - Saryrn)
update public.eqemu_items set stunresist = 5 where id = 28667; -- Bracer of Precision (P4 - Tallon Zek)
update public.eqemu_items set avoidance = 10 where id = 15815; -- Cloak of the Falling Skies (P4 - Tallon Zek)
update public.eqemu_items set strikethrough = 5 where id = 23498; -- Hopebringer (P4 - Tallon Zek)
update public.eqemu_items set combateffects = 10 where id = 26991; -- Band of Prismatic Focus (P4 - Tallon Zek)
update public.eqemu_items set accuracy = 15 where id = 28658; -- Mantle of Deadly Precision (P4 - Tallon Zek)
update public.eqemu_items set spellshield = 4 where id = 26988; -- Winged Storm Boots (P4 - Tallon Zek)
update public.eqemu_items set spellshield = 5 where id = 28656; -- Tactician's Shield (P4 - Tallon Zek)
update public.eqemu_items set strikethrough = 5 where id = 22890; -- Cudgel of Venomous Hatred (P4 - Terris Thule)
update public.eqemu_items set spellshield = 4 where id = 21995; -- Armguards of the Brute (P4 - Terris Thule)
update public.eqemu_items set avoidance = 5 where id = 26740; -- Shinai of the Ancients (P4 - Vallon Zek)
update public.eqemu_items set avoidance = 10 where id = 26799; -- Globe of Mystical Protection (P4 - Vallon Zek)
update public.eqemu_items set spellshield = 4 where id = 26986; -- Shoes of Fleeting Fury (P4 - Vallon Zek)
update public.eqemu_items set shielding = 2 where id = 8977; -- Collar of Catastrophe (P5 - Bertoxxulous)
update public.eqemu_items set shielding = 2, avoidance = 10 where id = 28651; -- Leggings of Furious Might (P5 - Bertoxxulous)
update public.eqemu_items set stunresist = 5 where id = 25995; -- Boots of Despair (P5 - Bertoxxulous)
update public.eqemu_items set accuracy = 5 where id = 24573; -- Timespinner, Blade of the Hunter (P5 - Bertoxxulous)
update public.eqemu_items set spellshield = 5 where id = 15927; -- Belt of Temporal Bindings (P5 - Bertoxxulous)
update public.eqemu_items set stunresist = 4 where id = 26980; -- Earring of Unseen Horrors (P5 - Cazic Thule)
update public.eqemu_items set shielding = 4 where id = 28650; -- Greaves of Furious Might (P5 - Cazic Thule)
update public.eqemu_items set strikethrough = 5 where id = 10948; -- Timestone Adorned Ring (P5 - Cazic Thule)
update public.eqemu_items set strikethrough = 10 where id = 27000; -- Padded Tigerskin Gloves (P5 - Cazic Thule)
update public.eqemu_items set shielding = 2 where id = 9289; -- Necklace of Eternal Visions (P5 - Innoruuk)
update public.eqemu_items set stunresist = 5 where id = 31603; -- Girdle of Stability (P5 - Innoruuk)
update public.eqemu_items set strikethrough = 10 where id = 28246; -- Gloves of Airy Mists (P5 - Innoruuk)
update public.eqemu_items set accuracy = 5 where id = 24692; -- Jagged Timeforged Blade (P5 - Innoruuk)
update public.eqemu_items set accuracy = 8 where id = 13674; -- Shroud of Survival (P5 - Innoruuk)
update public.eqemu_items set shielding = 3 where id = 27298; -- Shield of Strife (P5 - Rallos Zek)
update public.eqemu_items set stunresist = 5 where id = 32610; -- Sandals of Empowerment (P5 - Rallos Zek)
update public.eqemu_items set avoidance = 10 where id = 15824; -- Platinum Cloak of War (P5 - Rallos Zek)
update public.eqemu_items set strikethrough = 5 where id = 22999; -- Darkblade of the Warlord (P5 - Rallos Zek)
update public.eqemu_items set avoidance = 25 where id = 28652; -- Pants of Furious Might (P5 - Rallos Zek)
update public.eqemu_items set shielding = 4, damageshield = 5 where id = 15805; -- Shroud of Eternity (P6 - Quarm)
update public.eqemu_items set stunresist = 4, accuracy = 15 where id = 21993; -- Bracer of the Inferno (P6 - Quarm)
update public.eqemu_items set shielding = 2, stunresist = 4 where id = 32100; -- Earthen Bracer of Fortitude (P6 - Quarm)
update public.eqemu_items set stunresist = 5, avoidance = 20 where id = 28649; -- Ethereal Silk Leggings (P6 - Quarm)
update public.eqemu_items set stunresist = 5 where id = 27280; -- Whorl of Unnatural Forces (P6 - Quarm)
update public.eqemu_items set avoidance = 15, accuracy = 15 where id = 32110; -- Wristband of Icy Vengeance (P6 - Quarm)
update public.eqemu_items set strikethrough = 10 where id = 16156; -- Cord of Temporal Weavings (P6 - Quarm)
update public.eqemu_items set combateffects = 15 where id = 28661; -- Shawl of Eternal Forces (P6 - Quarm)
update public.eqemu_items set combateffects = 15 where id = 7123; -- Silver Hoop of Speed (P6 - Quarm)
update public.eqemu_items set spellshield = 6 where id = 26989; -- Prismatic Ring of Resistance (P6 - Quarm)
update public.eqemu_items set shielding = 2 where id = 32602; -- Grimror's Guard of the Plagues (Time Class BP)
update public.eqemu_items set shielding = 2 where id = 32132; -- Trydan's Chestplate of Nobility (Time Class BP)
update public.eqemu_items set shielding = 3 where id = 32129; -- Raex's Chestplate of Destruction (Time Class BP)
update public.eqemu_items set stunresist = 7 where id = 32134; -- Rizlona's Fiery Chestplate (Time Class BP)
update public.eqemu_items set stunresist = 7 where id = 32603; -- Ultor's Chestguard of Faith (Time Class BP)
update public.eqemu_items set stunresist = 7 where id = 32139; -- Kerasha's Sylvan Tunic (Time Class BP)
update public.eqemu_items set stunresist = 7 where id = 32138; -- Rosrak's Hauberk of the Primal (Time Class BP)
update public.eqemu_items set avoidance = 15 where id = 32131; -- Ton Po's Chestwraps of Composure (Time Class BP)
update public.eqemu_items set avoidance = 15 where id = 32136; -- Dumul's Chestwraps of the Brute (Time Class BP)
update public.eqemu_items set accuracy = 15 where id = 32130; -- Bidilis' Hauberk of the Elusive (Time Class BP)
update public.eqemu_items set accuracy = 15 where id = 32604; -- Askr's Thunderous Chainmail (Time Class BP)
update public.eqemu_items set spellshield = 6 where id = 32142; -- Miragul's Shroud of Risen Souls (Time Class BP)
update public.eqemu_items set spellshield = 6 where id = 32143; -- Maelin's Robe of Lore (Time Class BP)
update public.eqemu_items set spellshield = 6 where id = 32141; -- MagiKot's Robe of Convergence (Time Class BP)
update public.eqemu_items set spellshield = 6 where id = 32140; -- Romar's Robe of Visions (Time Class BP)
