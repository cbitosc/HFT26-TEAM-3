import { chromium } from 'playwright-core';
const CASE = process.argv[2] || 'case_15d861a6ef48';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const [name, w, h] of [['desktop', 1440, 900], ['tablet', 820, 1100], ['mobile', 390, 844], ['small', 360, 740]]) {
  for (const theme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.addInitScript((t) => { try { localStorage.setItem('traceline.theme', t); } catch {} }, theme);
    await p.goto(`http://localhost:5173/reconstruction/${CASE}`);
    const sec = p.locator('section[aria-label="Investigation findings"]');
    await sec.waitFor({ timeout: 20000 });
    await sec.scrollIntoViewIfNeeded();
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const nested = await sec.evaluate((s) => [...s.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e); return /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1; }).length);
    console.log(name, theme, 'hOverflow', over, 'nestedScrollers', nested);
    await sec.screenshot({ path: `../docs/frontend-findings/${name}-${theme}.png` });
    await p.close();
  }
}
await b.close();
