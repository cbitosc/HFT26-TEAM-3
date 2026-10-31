// Real-browser check of the automatic pause on an uploaded video (needs the API, the dev server and system Chrome).
//   node audit/e2e-accident-pause.mjs <caseId> [url]
import { chromium } from 'playwright-core';
const caseId = process.argv[2];
const base = process.argv[3] || 'http://localhost:5173';
const parse = (t) => { const m = t.match(/(\d+):(\d\d)\.(\d{3})/); return m ? (+m[1] * 60 + +m[2]) * 1000 + +m[3] : null; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 120))); page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
const api = (p) => fetch(`http://localhost:8000/api/v1${p}`).then((r) => r.json());
const tl = await api(`/cases/${caseId}/timeline`);
const events = Object.values(tl.lanes).flat();
const strong = events.filter((e) => e.event_type === 'possible_collision' && (e.observations.abrupt_speed_changes || []).length).sort((a, b) => a.start_ms - b.start_ms);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); };
await page.goto(`${base}/reconstruction/${caseId}`);
await page.waitForSelector('[aria-label="Accident alert settings"]', { timeout: 30000 });
await page.waitForTimeout(2500);
const clock = async () => parse(await page.locator('.mono.t-small').first().innerText());
const alertLoc = page.locator('[role=alert][aria-label="Possible accident alert"]');
const video = page.locator('[data-primary] video');
const vms = () => video.evaluate((v) => Math.round(v.currentTime * 1000));
const first = strong[0];
console.log(`case ${caseId}: ${strong.length} qualifying events, first at ${first?.start_ms} ms (cluster-merged by the 3 s policy)`);

await page.getByRole('button', { name: 'Play', exact: true }).click();
await alertLoc.waitFor({ state: 'visible', timeout: 25000 });
await page.waitForTimeout(400);
check('2. playback pauses when it reaches the first qualifying event', await video.evaluate((v) => v.paused));
const c1 = await clock();
const lead = events.find((e) => e.id === (null)) || null;
check('2b. paused clock is within one frame of an event time', strong.some((e) => Math.abs(c1 - e.start_ms) <= 40), `clock ${c1}, events ${strong.slice(0, 4).map((e) => e.start_ms)}`);
check('3. alert shows the possible-not-confirmed wording and the camera', /not a confirmed collision/.test(await alertLoc.innerText()) && /Camera/.test(await alertLoc.innerText()));
check('4. the matching sequence card is highlighted', (await page.locator('[aria-label="Incident sequence"] button[aria-pressed=true]').count()) >= 1);
check('5. keyframes are shown (stored frames only)', (await alertLoc.locator('img').count()) >= 1, `${await alertLoc.locator('img').count()} frames`);
// resume: must not re-trigger the same alert
await page.getByRole('button', { name: 'Resume playback' }).click();
await page.waitForTimeout(700);
check('8. after resuming, the same alert does not reappear and playback runs', !(await alertLoc.isVisible()) && !(await video.evaluate((v) => v.paused)));
// next event fires in order
await alertLoc.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
const c2 = await clock();
check('10. a later qualifying event fires after the first, in order', (await alertLoc.isVisible()) && c2 > c1, `second pause at ${c2}`);
// manual controls still work
await page.getByRole('button', { name: 'Dismiss alert' }).click();
await page.getByRole('button', { name: 'Back 1 s' }).click();
await page.waitForTimeout(600);
const c3 = await clock();
check('14. manual rewind works while stopped', c3 < c2, `${c2} -> ${c3}`);
// replay after seeking back fires again
await page.getByRole('button', { name: 'Play', exact: true }).click();
await alertLoc.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
check('9. seeking back and replaying alerts again', await alertLoc.isVisible());
// auto-pause off: detection continues but playback does not stop
await page.getByRole('button', { name: 'Dismiss alert' }).click().catch(() => {});
await page.getByLabel('Pause automatically at a possible accident').uncheck();
await page.getByRole('button', { name: 'Back 1 s' }).click();
await page.getByRole('button', { name: 'Back 1 s' }).click();
await page.getByRole('button', { name: 'Play', exact: true }).click();
await alertLoc.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
check('auto-pause off: alert appears as a notice and playback keeps running', (await alertLoc.isVisible()) && !(await video.evaluate((v) => v.paused)));
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
