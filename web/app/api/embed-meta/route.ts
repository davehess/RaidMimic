// Public link-preview document — what Discord/Slack/Twitter crawlers see.
//
// Every member page redirects unauthenticated requests to sign-in, so
// crawlers could never read a page's real <meta> tags: every shared link
// unfurled with the site-wide description. The middleware rewrites known
// preview-bot user-agents here with ?path=<original>, and we emit ONLY the
// OG/twitter tags for that path (web/lib/pageMeta.ts) — no data, no auth.
//
// NOTE: Discord caches unfurls per-URL for a while — re-shares of an
// already-posted link may show the old card until their cache expires.

import { NextRequest } from 'next/server';
import { SITE_NAME } from '@/lib/pageMeta';
import { metaForPathWithData } from '@/lib/pageMetaData';
import { isRaidmimicHost, isRaidmimicBetaHost, RAIDMIMIC_ORIGIN } from '@/lib/raidmimicHost';

export const dynamic = 'force-dynamic';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') || '/';
  const meta = await metaForPathWithData(path);
  // A link on raidmimic.com unfurls as Raid Mimic, on its own address, with no [beta] marker (raidmimic.com dropped the
  // markers, §613). The rewrite keeps the request's Host, so the crawler's host is the link's host.
  const rm = isRaidmimicHost(req.headers.get('host'));
  const site = rm ? 'Raid Mimic' : SITE_NAME;
  const origin = rm ? (isRaidmimicBetaHost(req.headers.get('host')) ? 'https://b.raidmimic.com' : RAIDMIMIC_ORIGIN) : 'https://wolfpack.quest';
  const title = rm ? meta.title.replace(/^\[beta\]\s*/i, '') : meta.title;
  const { description, image } = meta;
  const fullTitle = title === site || title === SITE_NAME ? site : `${title} — ${site}`;
  const url = `${origin}${path}`;
  // A page with a picture gets the big card; the rest keep the small one.
  const img = image ? `${origin}${image}` : null;
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escHtml(fullTitle)}</title>
<meta name="description" content="${escHtml(description)}">
<meta property="og:site_name" content="${site}">
<meta property="og:title" content="${escHtml(fullTitle)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="${escHtml(url)}">
<meta property="og:type" content="website">${img ? `
<meta property="og:image" content="${escHtml(img)}">
<meta name="twitter:image" content="${escHtml(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escHtml(fullTitle)}">
<meta name="twitter:description" content="${escHtml(description)}">
</head><body>${escHtml(fullTitle)} — ${escHtml(description)}</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
