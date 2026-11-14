import { expect, test, type Page } from '@playwright/test';

const answer = (page: Page) => page.locator('#answer');
/** The planned-date cell in a site's row (exact row name: "de Gerlache rim" is not "de Gerlache Rim 2"). */
const cell = (page: Page, site: string) =>
  page
    .locator('#planner tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: site, exact: true }) })
    .locator('td.planned');

/** Open the page and wait until the planner has answered. */
async function open(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(answer(page)).toContainText('sites work');
}

test.describe('the demo scenario', () => {
  test('opens on 19 April 2028 with six sites working', async ({ page }) => {
    await open(page);
    await expect(page.locator('#plan')).toHaveValue('2028-04-19');
    await expect(page.locator('#planner tbody tr')).toHaveCount(12);
    await expect(answer(page)).toContainText(
      'Landing 19 Apr 2028, 7-day window: 6 of 12 sites work',
    );
    await expect(cell(page, 'Connecting Ridge')).toHaveClass(/green/);
    await expect(cell(page, 'Shackleton rim')).toHaveClass(/red/);
  });

  test('a three-day slip turns four sites red and leaves two green', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 3; i++) await page.locator('#slip-on').click();
    await expect(page.locator('#plan')).toHaveValue('2028-04-22');
    await expect(answer(page)).toContainText('3 of 12 sites work');
    for (const site of [
      'Connecting Ridge',
      'de Gerlache rim',
      'de Gerlache Rim 2',
      'Peak near Cabeus B',
    ]) {
      await expect(cell(page, site), site).toHaveClass(/red/);
    }
    for (const site of ['Peak near Shackleton', 'Slater Plain', 'Shackleton rim']) {
      await expect(cell(page, site), site).toHaveClass(/green/);
    }
    await expect(cell(page, 'Peak near Shackleton')).toContainText('7.0');
  });

  test('choosing a cell opens that site and date in the Sun-Path Chart', async ({ page }) => {
    await open(page, '#plan=2028-04-22');
    await cell(page, 'Slater Plain').locator('button').click();
    await expect(page.locator('#site')).toHaveValue('slater-plain');
    await expect(page.locator('#date')).toHaveValue('2028-04-22');
    await expect(page.locator('#chart path.track.sun')).toBeVisible();
    await expect(page.locator('#site-info')).toContainText('LDEM');
    expect(page.url()).toContain('site=slater-plain');
  });
});

test.describe('Sun-Path Chart', () => {
  test('shows four lights with icons, and the time slider moves the clock', async ({ page }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22');
    const lights = page.locator('#lights li');
    await expect(lights).toHaveCount(4);
    await expect(lights.locator('svg.light-icon')).toHaveCount(4);
    await expect(lights.nth(2)).toContainText('Power');
    const label = page.locator('#time-label');
    await expect(label).toContainText('2028-04-22 00:00 UTC (day 1 of 7)');
    await page.locator('#time').fill('30');
    await expect(label).toContainText('2028-04-23 06:00 UTC (day 2 of 7)');
  });

  test('the Comms light names a Deep Space Network station', async ({ page }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22&t=36');
    await expect(page.locator('#lights li[data-light="comms"]')).toContainText(
      /link via (Goldstone|Canberra|Madrid)/,
    );
  });

  test('a bigger battery survives a night that a small one does not', async ({ page }) => {
    await open(page, '#site=connecting-ridge&date=2028-04-22');
    const summary = page.locator('#battery-summary');
    await expect(summary).toContainText('Does not survive');
    await page.locator('#customise summary').click();
    await page.locator('#p-batt').fill('12');
    await expect(summary).toContainText('Survives');
    await expect(summary).toContainText('Custom (from Small lander)');
    await page.locator('#p-reset').click();
    await expect(summary).toContainText('Does not survive');
  });

  test('each power system shows a credited NASA photograph', async ({ page }) => {
    await open(page);
    await expect(page.locator('#preset-img')).toHaveAttribute('src', /surveyor-3\.jpg$/);
    await expect(page.locator('#preset-credit')).toContainText('NASA');
    await page.locator('#preset').selectOption('crew');
    await expect(page.locator('#preset-img')).toHaveAttribute(
      'src',
      /apollo-11-lunar-module\.jpg$/,
    );
    const loaded = await page
      .locator('#preset-img')
      .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);
    expect(loaded).toBe(true);
  });
});

test.describe('views, theme and help', () => {
  test('Mission hides the explanations, Learn adds the teaching panels', async ({ page }) => {
    await open(page);
    await expect(page.locator('.intro')).toBeVisible();
    await expect(page.locator('#learn-ai')).toBeHidden();
    await page.getByText('Mission', { exact: true }).click();
    await expect(page.locator('.intro')).toBeHidden();
    await expect(page.locator('.keys-strip')).toBeVisible();
    expect(page.url()).toContain('v=mission');
    await page.getByText('Learn', { exact: true }).click();
    await expect(page.locator('#learn-ai')).toBeVisible();
    await expect(page.locator('#learn-start')).toBeVisible();
    await page.reload();
    await expect(page.locator('#learn-ai')).toBeVisible(); // remembered
  });

  test('the theme switch forces light and dark', async ({ page }) => {
    await open(page);
    const html = page.locator('html');
    await page.locator('#theme').click();
    const first = await html.getAttribute('data-theme');
    expect(['light', 'dark']).toContain(first);
    await page.locator('#theme').click();
    await expect(html).not.toHaveAttribute('data-theme', first ?? '');
  });

  test('keyboard shortcuts: slip, window, site, time, help', async ({ page }) => {
    await open(page);
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await expect(page.locator('#plan')).toHaveValue('2028-04-21');
    await page.keyboard.press('[');
    await expect(page.locator('#plan')).toHaveValue('2028-04-20');
    await page.keyboard.press('2');
    await expect(page.locator('#plan-days')).toHaveValue('14');
    await page.keyboard.press('d');
    await expect(page.locator('#plan')).toHaveValue('2028-04-19');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('#time')).toHaveValue('25');
    const before = await page.locator('#site').inputValue();
    await page.keyboard.press('j');
    await expect(page.locator('#site')).not.toHaveValue(before);
    await page.keyboard.press('Control+/');
    await expect(page.locator('#shortcuts')).toBeVisible();
    await expect(page.locator('#shortcuts')).toContainText(
      'Slip the planned landing one day later',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcuts')).toBeHidden();
  });

  test('typing in the question box does not trigger shortcuts', async ({ page }) => {
    await open(page);
    await page.locator('#ask-q').fill(']]] jk');
    await expect(page.locator('#plan')).toHaveValue('2028-04-19');
  });

  test('info tips explain where things come from', async ({ page }) => {
    await open(page);
    const tip = page.locator('#planner-title .info');
    await tip.locator('button').focus();
    await expect(tip.locator('.tip')).toBeVisible();
    await expect(tip.locator('.tip')).toContainText('NASA');
  });

  test('the map is tucked away, then shows twelve sites that open the chart', async ({ page }) => {
    await open(page);
    await expect(page.locator('#map')).toBeHidden();
    await page.locator('#map-details summary').click();
    await expect(page.locator('#map g.site')).toHaveCount(12);
    await page.locator('#map g.site', { hasText: 'Haworth' }).click();
    await expect(page.locator('#site')).toHaveValue('haworth');
  });
});

test.describe('plain-English question', () => {
  test('applies the settings the server returns (model reply stubbed)', async ({ page }) => {
    await page.route('**/api/ask', (route) =>
      route.fulfill({
        json: {
          ok: true,
          intent: { date: '2028-04-19', slip_days: 3, window_days: 14, site: 'haworth' },
        },
      }),
    );
    await open(page);
    await page
      .locator('#ask-q')
      .fill('Launch slips 3 days from 19 April, two week stay at Haworth');
    await page.locator('#ask button[type="submit"]').click();
    await expect(page.locator('#plan')).toHaveValue('2028-04-22');
    await expect(page.locator('#plan-days')).toHaveValue('14');
    await expect(page.locator('#site')).toHaveValue('haworth');
    await expect(page.locator('#ask-note')).toContainText('Understood as: landing 2028-04-22');
  });

  test('shows the reason when the server cannot use the question', async ({ page }) => {
    await page.route('**/api/ask', (route) =>
      route.fulfill({
        status: 422,
        json: { ok: false, error: 'Could not turn that into a date, slip, window or site.' },
      }),
    );
    await open(page);
    await page.locator('#ask-q').fill('what is the capital of France');
    await page.locator('#ask button[type="submit"]').click();
    await expect(page.locator('#ask-note')).toContainText('Could not turn that into');
    await expect(page.locator('#plan')).toHaveValue('2028-04-19');
  });
});

test.describe('page health', () => {
  test('loads without console errors or failed requests', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`error: ${e.message}`));
    page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
    await open(page);
    await page.locator('#map-details summary').click();
    await expect(page.locator('#map g.site')).toHaveCount(12);
    expect(problems).toEqual([]);
  });

  test('first view loads the planner summary, not every site file', async ({ page }) => {
    const siteFiles: string[] = [];
    page.on('request', (r) => r.url().includes('/data/sites/') && siteFiles.push(r.url()));
    await open(page);
    await expect(page.locator('#planner td.pending')).toHaveCount(0);
    expect(siteFiles).toHaveLength(1); // only the site shown in the chart
  });
});
