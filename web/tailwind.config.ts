import type { Config } from 'tailwindcss';

// Dark palette mirrors the agent's local web dashboard so the two surfaces
// feel like the same product.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Values live in app/tokens.css as RGB triplets (docs/DESIGN-theming.md §2); the names stay as they were.
        bg:     'rgb(var(--wp-bg) / <alpha-value>)',
        panel:  'rgb(var(--wp-panel) / <alpha-value>)',
        border: 'rgb(var(--wp-border) / <alpha-value>)',
        text:   'rgb(var(--wp-text) / <alpha-value>)',
        dim:    'rgb(var(--wp-dim) / <alpha-value>)',
        blue:   'rgb(var(--wp-blue) / <alpha-value>)',
        gold:   'rgb(var(--wp-gold) / <alpha-value>)',
        green:  'rgb(var(--wp-green) / <alpha-value>)',
        red:    'rgb(var(--wp-red) / <alpha-value>)',
        orange: 'rgb(var(--wp-orange) / <alpha-value>)',
        purple: 'rgb(var(--wp-purple) / <alpha-value>)',
        accent: 'rgb(var(--wp-accent) / <alpha-value>)',
        // Tokens v2 (app/tokens.css): today's look unless an html[data-ds] preview is on.
        raised: 'rgb(var(--wp-raised) / <alpha-value>)',
        bone:   'rgb(var(--wp-bone) / <alpha-value>)',
        text2:  'rgb(var(--wp-text-2) / <alpha-value>)',
        text3:  'rgb(var(--wp-text-3) / <alpha-value>)',
        title:  'rgb(var(--wp-title) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['var(--wp-font-mono)'],
        body:  ['var(--wp-font-body)'],
        title: ['var(--wp-font-title)'],
      },
    },
  },
  plugins: [],
};

export default config;
