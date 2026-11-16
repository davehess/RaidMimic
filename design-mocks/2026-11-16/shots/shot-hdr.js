const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, name] of [[1440, 700, 'hdr-1440'], [1440, 700, 'hdr-1440-scrolled'], [390, 700, 'hdr-390'], [1440, 500, 'hdr-1440-download']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto('http://127.0.0.1:3311/about', { waitUntil: 'networkidle', timeout: 90000 });
    await p.waitForTimeout(800);
    if (name.includes('scrolled')) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(600); }
    if (name.includes('download')) { const btn = p.getByRole('button', { name: 'Download Mimic' }); await btn.first().click(); await p.waitForTimeout(400); }
    await p.screenshot({ path: `hdr-shots/${name}.png`, clip: { x: 0, y: 0, width: w, height: name.includes('download') ? 260 : 120 } });
    await p.close();
  }
  await b.close();
})();
