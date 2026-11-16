// The design-system preview switch (the guild lead, 2026-11-16: "start with base design, so everything can feel like
// one site"). `?ds=a|b|c` on any page of the BETA build sets the wp_ds cookie and `?ds=off` clears it; the middleware
// passes the decision to app/layout.tsx on the x-wp-ds request header, and the layout puts data-ds on <html>, which is
// the only thing app/globals.css and app/tokens.css key on. Production never sets it: every entry point takes `isBeta`
// and answers "off" when it is false.
// Pure (no server imports) so the Edge middleware, the layout and test/design-system.test.js share one decision.

export const DS_COOKIE = 'wp_ds';
/** The middleware hands the layout its decision on this request header: the root layout reads headers() already and must
 *  not add cookies() (test/guild-theme.test.js holds it to that). */
export const DS_HEADER = 'x-wp-ds';
export const DS_VALUES = ['a', 'b', 'c'] as const;
export type DsValue = (typeof DS_VALUES)[number];
/** A month, like the admin sidebar preview: long enough to survive a week away, short enough not to outlive the pick. */
export const DS_MAX_AGE = 60 * 60 * 24 * 30;

/** The picked voice (the guild lead, Desk card ui-standard, 2026-11-16: B). It is beta's DEFAULT: a page with no cookie
 *  shows it, so no page can sit in the old look because a cookie was missing ("the design jumps from page to page").
 *  `?ds=off` stores "off" and shows today's look as the before. */
export const DS_DEFAULT: DsValue = 'b';

/** For pages built statically (force-static: /privacy and friends), where the layout cannot read the request: a few bytes
 *  that put the cookie's voice (or the default) on <html> before the body paints. The layout renders it on beta only. */
export const DS_BOOT_SCRIPT =
  `try{var m=document.cookie.match(/(?:^|; )wp_ds=([abc]|off)(?:;|$)/);var v=m?m[1]:'${DS_DEFAULT}';if(v!=='off')document.documentElement.setAttribute('data-ds',v)}catch(e){}`;

export const isDs =(v: string | null | undefined): v is DsValue => !!v && (DS_VALUES as readonly string[]).includes(v);

/** What a request means: which look is on for THIS request (null = today's), and what the response stores in the cookie
 *  ('set' stores `on`, 'off' stores "off"). On beta, no cookie means the default. */
export function dsChoice(
  param: string | null | undefined, cookie: string | undefined, isBeta: boolean,
): { on: DsValue | null; action: 'set' | 'off' | 'keep' } {
  if (!isBeta) return { on: null, action: 'keep' };
  if (isDs(param)) return { on: param, action: 'set' };
  if (param === 'off') return { on: null, action: 'off' };
  if (cookie === 'off') return { on: null, action: 'keep' };
  return { on: isDs(cookie) ? cookie : DS_DEFAULT, action: 'keep' };
}
