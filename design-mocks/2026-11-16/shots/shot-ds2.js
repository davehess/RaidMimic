const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  for (const ds of ['b', 'a', 'c', 'off']) {
    await p.goto(`http://127.0.0.1:3312/about?ds=${ds}`, { waitUntil: 'networkidle', timeout: 120000 });
    for (const path of ['/privacy', '/about']) {
      await p.goto(`http://127.0.0.1:3312${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await p.waitForTimeout(400);
      console.log(path, ds, 'data-ds=', await p.evaluate(() => document.documentElement.getAttribute('data-ds')));
      await p.screenshot({ path: `ds-shots/real-${path.slice(1)}-${ds}.png` });
    }
  }
  await b.close();
})();
