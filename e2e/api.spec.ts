// The Worker itself: the API, the static data, and the password gate.
import { expect, test } from '@playwright/test';

const GATED = 'http://127.0.0.1:8798';
const PASSWORD = 'e2e-test-only'; // from e2e/gated.vars; a local test value, not a real secret

test.describe('open Worker', () => {
  test('health, site list and a site file', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toMatchObject({ ok: true });

    const sites = (await (await request.get('/data/sites.json')).json()) as { id: string }[];
    expect(sites).toHaveLength(12);
    expect(sites.some((s) => s.id.startsWith('fake-'))).toBe(false);

    const site = (await (await request.get('/data/sites/shackleton-rim.json')).json()) as {
      horizons: { elev_deg: number[] }[];
      times: { n: number };
      stations: number[];
    };
    expect(site.horizons).toHaveLength(3);
    expect(site.horizons[0]?.elev_deg).toHaveLength(720);
    expect(site.times.n).toBe(17_544);
    expect(site.stations).toHaveLength(17_544);
  });

  test('/etiles answers 404 outside the grid and serves a tile with a week-long cache', async ({
    request,
  }) => {
    for (const p of [
      '/etiles/wac/9/0/0',
      '/etiles/lola/6/0/0',
      '/etiles/wac/0/1/0',
      '/etiles/x/0/0/0',
    ]) {
      expect((await request.get(p)).status(), p).toBe(404);
    }
    const ok = await request.get('/etiles/lola/0/0/0');
    expect(ok.status()).toBe(200);
    expect(ok.headers()['cache-control']).toBe('public, max-age=604800');
  });

  test('/api/ask rejects empty and over-long questions without calling the model', async ({
    request,
  }) => {
    expect((await request.post('/api/ask', { data: { q: '' } })).status()).toBe(400);
    expect((await request.post('/api/ask', { data: { q: 'x'.repeat(201) } })).status()).toBe(400);
    expect((await request.post('/api/ask', { data: 'not json' })).status()).toBe(400);
  });
});

test.describe('password gate', () => {
  test('everything needs the password: page, data and API', async ({ request }) => {
    for (const path of [
      '/',
      '/data/sites.json',
      '/data/sites/haworth.json',
      '/api/health',
      '/map/south-pole-hillshade.jpg',
      '/etiles/wac/0/0/0',
    ]) {
      expect((await request.get(GATED + path)).status(), path).toBe(401);
    }
    expect((await request.post(`${GATED}/api/ask`, { data: { q: 'x' } })).status()).toBe(401);
  });

  test('the right password opens it; a wrong one does not', async ({ request }) => {
    const auth = (pw: string) => ({
      Authorization: `Basic ${Buffer.from(`fourlights:${pw}`).toString('base64')}`,
    });
    expect(
      (await request.get(`${GATED}/data/sites.json`, { headers: auth(PASSWORD) })).status(),
    ).toBe(200);
    expect((await request.get(`${GATED}/`, { headers: auth('wrong') })).status()).toBe(401);
  });
});
