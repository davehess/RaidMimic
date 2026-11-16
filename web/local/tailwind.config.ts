import type { Config } from 'tailwindcss';
import base from '../tailwind.config';

// The website's palette and fonts, so the two read as one product; only where the classes are SCANNED
// differs: this app, plus the shared components and the explorer it reuses.
const config: Config = {
  ...base,
  content: [
    './app/**/*.{ts,tsx}',
    '../components/**/*.{ts,tsx}',
    '../app/me/inventory/*.tsx',
    '../app/spectator/*.tsx',
    '../app/spectator/replay/*.tsx',
    // The PoP flags page reuses the website's gate table and character cards (the guild lead, 2026-11-16: "Where is the
    // color on these local pages?"): their green / tone classes exist only in these folders, so unscanned they rendered white.
    '../app/pop/guide/*.tsx',
    '../app/characters/*.tsx',
  ],
};

export default config;
