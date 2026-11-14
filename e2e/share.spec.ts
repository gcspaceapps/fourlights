// Shared projects: two browsers on one Durable Object, and an outside caller (what an AI agent's
// MCP tool will be) changing it through the REST route.
import { expect, test, type Browser, type Page } from '@playwright/test';

const tab = (page: Page, slug: string) => page.locator(`#tab-${slug}`);

async function ready(page: Page): Promise<void> {
  await expect(page.locator('#answer')).toContainText('sites work');
}

/** Page A makes a project; page B (another browser context) opens its link. */
async function twoOnAProject(browser: Browser, baseURL: string) {
  const a = await (await browser.newContext()).newPage();
  await a.goto(`${baseURL}/`);
  await ready(a);
  await a.locator('#share-open').click();
  await a.locator('#share-name').fill('Landing review');
  await a.locator('#share-create-btn').click();
  await expect(a.locator('#share-id')).toHaveText(/^[0-9a-f-]{36}$/);
  const id = (await a.locator('#share-id').textContent()) ?? '';
  await a.locator('#share-close').click();
  const b = await (await browser.newContext()).newPage();
  await b.goto(`${baseURL}/#project=${id}`);
  await ready(b);
  await expect(b.locator('#share-open-label')).toContainText('Landing review · 2 people');
  return { a, b, id };
}

test('a shared project keeps two browsers in step, and an agent can drive it', async ({
  browser,
  baseURL,
}) => {
  const { a, b, id } = await twoOnAProject(browser, baseURL ?? '');

  // The tab follows.
  await tab(a, 'map').click();
  await expect(tab(b, 'map')).toHaveAttribute('aria-selected', 'true');

  // The landing date follows (the slip key is `]`).
  await tab(a, 'planner').click();
  await expect(tab(b, 'planner')).toHaveAttribute('aria-selected', 'true');
  const before = await a.locator('#plan').inputValue();
  await a.locator('#slip-on').click();
  await expect(b.locator('#plan')).not.toHaveValue(before);
  await expect(b.locator('#plan')).toHaveValue(await a.locator('#plan').inputValue());

  // A site added by one appears for the other, and is selected.
  await tab(a, 'map').click();
  await a.locator('#globe-add').click();
  await a.locator('#globe-add-name').fill('Camp Alpha');
  await a.locator('#globe-add-lat').fill('-88.5');
  await a.locator('#globe-add-lon').fill('12');
  await a.locator('#globe-add-form button[type=submit]').click();
  await expect(b.locator('#site option', { hasText: 'Camp Alpha' })).toHaveCount(1);
  await expect(b.locator('#site')).toHaveValue('camp-alpha');

  // With the follow switch off, the view stays put but data keeps flowing.
  await b.locator('#share-open').click();
  await b.locator('#share-follow').uncheck();
  await b.locator('#share-close').click();
  await tab(a, 'planner').click();
  await a.locator('#slip-on').click();
  await expect(b.locator('#plan')).toHaveValue(await a.locator('#plan').inputValue());
  await expect(tab(b, 'map')).toHaveAttribute('aria-selected', 'true');

  // An outside caller: show the battery tab, add a site, and everyone sees it. B is not following,
  // so only A moves tab.
  const cmd = (body: object) =>
    a.request.post(`${baseURL}/api/projects/${id}/commands`, { data: body });
  expect((await cmd({ t: 'set', view: { tab: 'survive-the-night' } })).ok()).toBe(true);
  await expect(tab(a, 'survive-the-night')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(b, 'map')).toHaveAttribute('aria-selected', 'true');
  expect((await cmd({ t: 'addSite', name: 'Agent Camp', lat: -87.2, lon_e: 40 })).ok()).toBe(true);
  await expect(b.locator('#site option', { hasText: 'Agent Camp' })).toHaveCount(1);
  await expect(a.locator('#site')).toHaveValue('agent-camp');
});

test('the Moon turns for everyone following', async ({ browser, baseURL }) => {
  const { a, b, id } = await twoOnAProject(browser, baseURL ?? '');
  await tab(a, 'map').click();
  await expect(tab(b, 'map')).toHaveAttribute('aria-selected', 'true');
  await expect(b.locator('#globe-view canvas')).toHaveCount(1);
  await expect(a.locator('#globe-view canvas')).toHaveCount(1);
  await b.waitForTimeout(1500);
  const before = await b.locator('#globe-view canvas').screenshot();

  // A flies to the pole: the project's camera moves and B's picture of the Moon changes.
  await a.locator('#globe-pole').click();
  await expect
    .poll(async () => {
      const r = await a.request.get(`${baseURL}/api/projects/${id}`);
      const cam = ((await r.json()) as { project: { view: { cam: { lat: number } | null } } })
        .project.view.cam;
      return cam?.lat;
    })
    .toBeLessThan(-80);
  await expect
    .poll(async () => (await b.locator('#globe-view canvas').screenshot()).equals(before))
    .toBe(false);

  // The layer is shared too (the hidden select is the source of truth).
  await a.locator('#globe-layer').evaluate((el: HTMLSelectElement) => {
    el.value = 'lola';
    el.dispatchEvent(new Event('change'));
  });
  await expect(b.locator('#globe-layer')).toHaveValue('lola');
});

test('a project is found only by its ID', async ({ page, baseURL }) => {
  const none = await page.request.get(
    `${baseURL}/api/projects/00000000-0000-4000-8000-000000000000`,
  );
  expect(none.status()).toBe(404);
  // There is no list.
  expect((await page.request.get(`${baseURL}/api/projects`)).ok()).toBe(false);
  await page.goto(`${baseURL}/#project=00000000-0000-4000-8000-000000000000`);
  await ready(page);
  await expect(page.locator('#ask-note')).toContainText('does not exist');
});
