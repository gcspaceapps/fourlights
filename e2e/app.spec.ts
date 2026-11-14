import { expect, test, type Page } from '@playwright/test';

const answer = (page: Page) => page.locator('#answer');
/** A site's row (exact name: "de Gerlache rim" is not "de Gerlache Rim 2"). */
const row = (page: Page, site: string) =>
  page
    .locator('#planner tbody tr')
    .filter({ has: page.getByRole('button', { name: site, exact: true }) });
/** The cell for the landing now shown in a site's row (the planned date until it slips). */
const cell = (page: Page, site: string) => row(page, site).locator('td.landing');

/** Open the page and wait until the planner has answered. */
async function open(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(answer(page)).toContainText('sites work');
}

/** Switch to a tab by its label and wait until it is the selected one. */
async function showTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
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

    // The plan stays pinned on 19 Apr, and the answer says what the slip cost.
    await expect(page.locator('#planner thead th.planned')).toContainText('19 Apr');
    await expect(page.locator('#planner thead th.landing')).toContainText('22 Apr');
    await expect(page.locator('#planner thead th.landing')).toContainText('now +3 d');
    await expect(row(page, 'Connecting Ridge').locator('td.planned')).toHaveClass(/green/);
    await expect(answer(page)).toContainText(
      'Against the planned 19 Apr (3 days later; 6 worked then): lost 4 (',
    );
    await expect(answer(page)).toContainText('gained 1 (Shackleton rim), 2 still work.');
    expect(page.url()).toContain('slip=3');
    // Slipping back to the plan ends the comparison.
    for (let i = 0; i < 3; i++) await page.locator('#slip-back').click();
    await expect(answer(page)).not.toContainText('Against the planned');
    await expect(page.locator('#planner thead th.landing.planned')).toContainText('19 Apr');
  });

  test('a date outside the data is refused with a reason, not answered', async ({ page }) => {
    await open(page);
    await page.locator('#plan').fill('2027-12-31');
    await page.locator('#plan').blur();
    await expect(page.locator('#plan')).toHaveValue('2028-01-01');
    await expect(page.locator('#plan-note')).toHaveText(
      'No data before 1 Jan 2028: showing 1 Jan 2028.',
    );
    await expect(answer(page)).toContainText('Landing 1 Jan 2028');
    await page.locator('#plan').fill('2028-04-19');
    await page.locator('#plan').blur();
    await expect(page.locator('#plan-note')).toBeEmpty();
  });

  test('the reason for a cell is written under the table for keyboard users', async ({ page }) => {
    await open(page);
    const why = page.locator('#cell-why');
    await expect(why).toContainText('Point at a cell');
    await cell(page, 'Connecting Ridge').locator('button').focus();
    await expect(why).toContainText('Connecting Ridge, landing 19 Apr: 6.9 usable days, works');
    await cell(page, 'Shackleton rim').locator('button').hover();
    await expect(why).toContainText('Shackleton rim, landing 19 Apr');
    await expect(why).toContainText('no power');
  });

  test('approximate terrain is marked in the row and in the answer', async ({ page }) => {
    await open(page, '#date=2028-04-26');
    await expect(row(page, 'Nobile Rim 2').getByRole('rowheader')).toContainText('approx. terrain');
    await expect(row(page, 'Slater Plain').getByRole('rowheader')).not.toContainText('approx.');
    await expect(answer(page)).toContainText('Nobile Rim 2 (approx. terrain)');
  });

  test('choosing a cell opens that site and date in the Sun-Path Chart', async ({ page }) => {
    await open(page, '#plan=2028-04-22');
    await cell(page, 'Slater Plain').locator('button').click();
    await expect(page.locator('#site')).toHaveValue('slater-plain');
    await expect(page.locator('#plan')).toHaveValue('2028-04-22');
    await expect(page.getByRole('tab', { name: 'Sun-Path Chart' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('#chart path.track.sun')).toBeVisible();
    await showTab(page, 'About this site');
    await expect(page.locator('#site-info')).toContainText('LDEM');
    expect(page.url()).toContain('site=slater-plain');
  });
});

test.describe('Sun-Path Chart', () => {
  test('shows four lights with icons, and the time slider moves the clock', async ({ page }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22&tab=sun-path-chart');
    const lights = page.locator('#lights li');
    await expect(lights).toHaveCount(4);
    await expect(lights.locator('svg.light-icon')).toHaveCount(4);
    await expect(lights.nth(2)).toContainText('Power');
    const label = page.locator('#time-label');
    await expect(label).toContainText('2028-04-22 00:00 UTC (day 1 of 7)');
    await page.locator('#time').fill('30');
    await expect(label).toContainText('2028-04-23 06:00 UTC (day 2 of 7)');
  });

  test('a shared link keeps its time, and a hidden body is faded but still named', async ({
    page,
  }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22&days=14&h=1&t=300');
    await expect(page.locator('#time')).toHaveValue('300');
    await expect(page.locator('#time-label')).toContainText('2028-05-04 12:00 UTC (day 13 of 14)');
    const earth = page.locator('#lights li[data-light="earth"]');
    await expect(earth).toContainText('off');
    await expect(page.locator('#chart circle.marker.earth')).toHaveClass(/hidden/);
    await expect(page.locator('#chart text.label.earth')).toHaveText('Earth (hidden)');
  });

  test('the pointing table gives the raw numbers, and the window downloads as CSV', async ({
    page,
  }) => {
    await open(page, '#site=connecting-ridge&date=2028-04-22&t=100&tab=sun-path-chart');
    const row = (body: string) =>
      page.locator('#pointing tbody tr', { hasText: body }).locator('td');
    await expect(page.locator('#pointing thead th')).toHaveText([
      '',
      'Azimuth',
      'Elevation',
      'Terrain there',
      'Clearance',
    ]);
    await expect(row('Sun')).toHaveText(['296.10°', '−1.28°', '−1.30°', '+0.02°']);
    await expect(row('Earth').nth(3)).toHaveClass(/clear/);
    await page.locator('#time').fill('0');
    await expect(row('Sun').first()).not.toHaveText('296.10°'); // follows the slider

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#pointing-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe('four-lights_connecting-ridge_2028-04-22_7d_2m.csv');
    const lines = (await (await download.createReadStream()).toArray()).join('').trim().split('\n');
    expect(lines).toHaveLength(1 + 7 * 24);
    expect(lines[0]).toContain('time_utc,sun_az_deg,sun_el_deg');
    expect(lines[1]).toMatch(/^2028-04-22T00:00Z,/);
  });

  test('the Comms light names a Deep Space Network station', async ({ page }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22&t=36');
    await expect(page.locator('#lights li[data-light="comms"]')).toContainText(
      /link via (Goldstone|Canberra|Madrid)/,
    );
  });

  test('a bigger battery survives a night that a small one does not', async ({ page }) => {
    await open(page, '#site=connecting-ridge&date=2028-04-22&tab=survive-the-night');
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
    await open(page, '#tab=survive-the-night');
    await expect(page.locator('#preset-img')).toHaveAttribute('src', /surveyor-3\.jpg$/);
    await expect(page.locator('#preset-credit')).toContainText('NASA');
    await page.getByRole('button', { name: 'Crewed lander' }).click();
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

test.describe('button groups', () => {
  test('window, height and centre are buttons that drive the chart and the URL', async ({
    page,
  }) => {
    await open(page, '#site=peak-near-shackleton&date=2028-04-22&tab=sun-path-chart');
    const group = (name: string) => page.getByRole('group', { name });
    await group('Observer height (m)')
      .getByRole('button', { name: 'Observer height (m): 5' })
      .click();
    await expect(page.locator('#height')).toHaveValue('5');
    await expect(page.locator('#chart')).toContainText('observer 5 m');
    await group('Centre on').getByRole('button', { name: 'South (pole)' }).click();
    await expect(page.locator('#centre')).toHaveValue('180');
    await expect(group('Centre on').getByRole('button', { name: 'South (pole)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group('Centre on').getByRole('button', { name: 'North' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(page.url()).toContain('h=5');
    expect(page.url()).toContain('c=180');
    // A keyboard shortcut moves the same control, and the buttons follow.
    await page.keyboard.press('h');
    await expect(
      group('Observer height (m)').getByRole('button', { name: 'Observer height (m): 1' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the planner window buttons change the grid', async ({ page }) => {
    await open(page);
    await page
      .getByRole('group', { name: 'Mission window (days)' })
      .getByRole('button', { name: 'Mission window (days): 30' })
      .click();
    await expect(page.locator('#plan-days')).toHaveValue('30');
    await expect(answer(page)).toContainText('30-day window');
  });
});

test.describe('views, theme and help', () => {
  test('Mission hides the explanations, Learn adds the teaching panels', async ({ page }) => {
    await open(page);
    // Explore keeps the question and the tools; the longer introduction is for Learn.
    await expect(page.locator('.tagline')).toBeVisible();
    await expect(page.locator('.legend')).toBeVisible();
    await expect(page.locator('.intro')).toBeHidden();
    await expect(page.locator('#learn-ai')).toBeHidden();
    await page.getByText('Mission', { exact: true }).click();
    await expect(page.locator('.legend')).toBeHidden();
    await expect(page.locator('.keys-strip')).toBeVisible();
    expect(page.url()).toContain('v=mission');
    await page.getByText('Learn', { exact: true }).click();
    await expect(page.locator('.intro')).toBeVisible();
    // Each teaching panel is its own tab, and only exists in the Learn view.
    await showTab(page, 'Where AI is used');
    await expect(page.locator('#learn-ai')).toBeVisible();
    await showTab(page, 'Start here');
    await expect(page.locator('#learn-start')).toBeVisible();
    await page.reload();
    await expect(page.locator('#learn-start')).toBeVisible(); // remembered
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
    await page.keyboard.press('.');
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

  test('the map tab lists twelve sites: the button flies, "Open chart" opens the chart', async ({
    page,
  }) => {
    const wanted: string[] = [];
    page.on('request', (r) => /globe|etiles/.test(r.url()) && wanted.push(r.url()));
    await open(page);
    // Nothing of the 3D map is downloaded until its tab is opened.
    await page.waitForTimeout(500);
    expect(wanted).toEqual([]);
    await expect(page.locator('#globe-sites')).toBeHidden();
    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(page.locator('#globe-sites li')).toHaveCount(12);
    await expect(page.locator('.globe-legend li')).toHaveCount(4);
    // Every verdict has a symbol and words, not colour alone.
    await expect(page.locator('#globe-sites li .sym').first()).toHaveText(/[●▲✕○]/);
    await page.getByRole('button', { name: /^Fly to Haworth/ }).click();
    await expect(page.locator('#tab-map')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Open the chart for Haworth' }).click();
    await expect(page.locator('#site')).toHaveValue('haworth');
  });

  test('the 3D map loads tiles lazily, switches layer, and leaves no canvas behind', async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
    await open(page);
    const tiles: string[] = [];
    page.on('request', (r) => r.url().includes('/etiles/') && tiles.push(r.url()));
    for (let i = 0; i < 3; i++) {
      await page.getByRole('tab', { name: 'Map' }).click();
      const canvas = page.locator('#globe-view canvas');
      const noWebgl = page.locator('#globe-fallback');
      // Software WebGL may be missing on a runner: then the message and the list still work.
      await expect(canvas.or(noWebgl.filter({ hasText: 'WebGL' }))).toHaveCount(1);
      await page.getByRole('tab', { name: 'Planner' }).click();
      await expect(page.locator('#globe-view canvas')).toHaveCount(0);
    }
    expect(problems.filter((p) => !/WebGL|GPU stall|favicon|404/.test(p))).toEqual([]);
    if (tiles.length) {
      expect(tiles.every((u) => /\/etiles\/(wac|lola)\/\d+\/\d+\/\d+$/.test(u))).toBe(true);
    }
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
    await page.getByRole('tab', { name: 'Map' }).click();
    await expect(page.locator('#globe-sites li')).toHaveCount(12);
    await page.waitForTimeout(1500);
    // A runner without software WebGL logs its own context warning; anything else is a failure.
    expect(problems.filter((p) => !/WebGL/i.test(p))).toEqual([]);
  });

  test('first view loads the planner summary, not every site file', async ({ page }) => {
    const siteFiles: string[] = [];
    page.on('request', (r) => r.url().includes('/data/sites/') && siteFiles.push(r.url()));
    await open(page);
    await expect(page.locator('#planner td.pending')).toHaveCount(0);
    expect(siteFiles).toHaveLength(1); // only the site shown in the chart
  });
});

test.describe('data sources page', () => {
  test('lists every dataset with its use, citation and a working link back', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Data sources', exact: true }).click();
    await expect(page).toHaveURL(/\/sources/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data sources');
    for (const id of [
      'lola',
      'horizons',
      'spice',
      'usgs',
      'images',
      'compare',
      'ours',
      'download',
    ]) {
      await expect(page.locator(`#${id}`), id).toBeVisible();
    }
    await expect(page.locator('section[aria-labelledby="lola"]')).toContainText('LDEM_75S_240M');
    await expect(page.locator('section[aria-labelledby="horizons"]')).toContainText('17,544');
    await expect(page.locator('section[aria-labelledby="ours"]')).toContainText(
      'not NASA requirements',
    );
    await page.getByRole('link', { name: '← Back to Four Lights' }).first().click();
    await expect(answer(page)).toContainText('sites work');
  });

  test('its download links serve the data', async ({ page, request }) => {
    await page.goto('/sources');
    const hrefs = await page
      .locator('section[aria-labelledby="download"] a[href^="/data/"]')
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
  });
});

test.describe('how we built it', () => {
  test('renders its three architecture diagrams and links back', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'How we built it' }).click();
    await expect(page).toHaveURL(/\/how/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How we built it');
    await expect(page.locator('pre.mermaid svg')).toHaveCount(3);
    await expect(page.locator('pre.mermaid').first()).toContainText('Horizon engine');
    for (const id of [
      'overview',
      'decisions',
      'pipeline',
      'engine',
      'serving',
      'correct',
      'quality',
      'stack',
      'team',
    ]) {
      await expect(page.locator(`#${id}`), id).toBeVisible();
    }
    await page.getByRole('link', { name: '← Back to Four Lights' }).first().click();
    await expect(answer(page)).toContainText('sites work');
  });
});

test.describe('Open in QGIS', () => {
  test('the guide links the project and lists every layer at this address', async ({
    page,
    baseURL,
  }) => {
    await open(page);
    await page.getByRole('link', { name: 'Open in QGIS' }).click();
    await expect(page).toHaveURL(/\/qgis$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open in QGIS');
    await expect(page.getByRole('link', { name: 'qgis.org/download' })).toHaveAttribute(
      'href',
      'https://qgis.org/download/',
    );
    await expect(page.getByRole('link', { name: 'four-lights.qgs' })).toHaveAttribute(
      'href',
      '/qgis/four-lights.qgs',
    );
    await expect(page.locator('#qgis-files tr')).toHaveCount(13);
    await expect(page.locator('#qgis-files')).toContainText(`${baseURL}/qgis/sites.fgb`);
    await expect(page.locator('#qgis-files')).toContainText(`${baseURL}/qgis/r2/slope-20m.cog.tif`);
    // Both pictures are QGIS's own drawings of the layers, and they load.
    for (const img of await page.locator('.qgis-shot img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
        .toBe(true);
    }
  });
});

test.describe('Learn view pictures', () => {
  test('shows NASA photographs and two charts drawn from the site data', async ({ page }) => {
    await open(page, '#v=learn');
    // The pictures sit in the tab they explain.
    for (const [tab, file] of [
      ['Start here', 'south-pole-clementine.jpg'],
      ['Start here', 'earthrise-apollo-8.jpg'],
      ['Sun-Path Chart', 'dss-43-canberra.jpg'],
    ] as const) {
      await showTab(page, tab);
      const img = page.locator(`img[src$="${file}"]`);
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
        .toBe(true);
    }
    await showTab(page, 'Start here');
    await expect(page.locator('#learn-sun path.sun-line')).toHaveCount(1);
    await expect(page.locator('#learn-earth path.earth-line')).toHaveCount(1);
    await expect(page.locator('#learn-earth path.terrain-line')).toHaveCount(1);
    await expect(page.locator('.learn figcaption').first()).toContainText('NASA');
  });
});
