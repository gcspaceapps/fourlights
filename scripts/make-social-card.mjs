// The picture social sites show beside a shared link: the Slip Planner after a 3-day slip, in the
// dark theme with the Guide closed, 1200 by 630 (the size Open Graph and X cards expect). A real
// screenshot of the app: a 1600 by 840 window drawn at three-quarter scale, so the table is in it.
//   node scripts/make-social-card.mjs [base URL, default http://localhost:8787]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8787';
const out = new URL('../web/public/img/social-card.jpg', import.meta.url).pathname;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1600, height: 840 },
  deviceScaleFactor: 0.75,
  colorScheme: 'dark',
});
await page.goto(base, { waitUntil: 'networkidle' });
const slip = page.getByRole('button', { name: /Slip \+ 1 day/ });
for (let i = 0; i < 3; i++) await slip.click();
await page.getByRole('button', { name: 'Guide', exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log(`wrote ${out}`);
