// The Worker, run in Node with stubbed bindings: the password gate, the health check, the static
// fallthrough, and /api/ask's input limits and reply handling. No network, no real model.
import { describe, expect, it } from 'vitest';
import app from '../src/index';

const SITES = [
  { id: 'shackleton-rim', name: 'Shackleton rim' },
  { id: 'haworth', name: 'Haworth' },
];

function env(reply: unknown = '{}', password?: string) {
  return {
    SITE_PASSWORD: password,
    ASSETS: {
      fetch: (req: Request) =>
        Promise.resolve(
          new URL(req.url).pathname === '/data/sites.json'
            ? Response.json(SITES)
            : new Response(`asset ${new URL(req.url).pathname}`),
        ),
    },
    AI: {
      run: () =>
        reply instanceof Error ? Promise.reject(reply) : Promise.resolve({ response: reply }),
    },
  };
}

const ask = (q: unknown, e = env()) =>
  app.request(
    '/api/ask',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
    },
    e,
  );
const basic = (pw: string) => ({ Authorization: `Basic ${btoa(`fourlights:${pw}`)}` });

describe('Worker', () => {
  it('answers the health check and passes everything else to the static assets', async () => {
    const health = await app.request('/api/health', {}, env());
    expect(await health.json()).toMatchObject({ ok: true });
    expect(await (await app.request('/sources', {}, env())).text()).toBe('asset /sources');
  });

  it('with a password set, every path needs it', async () => {
    const e = env('{}', 'secret');
    for (const path of ['/', '/api/health', '/data/sites.json', '/img/x.jpg']) {
      expect((await app.request(path, {}, e)).status, path).toBe(401);
    }
    expect((await ask('x', e)).status).toBe(401);
    expect((await app.request('/api/health', { headers: basic('wrong') }, e)).status).toBe(401);
    expect((await app.request('/api/health', { headers: basic('secret') }, e)).status).toBe(200);
  });

  it('/api/ask refuses empty, non-text and over-long questions', async () => {
    expect((await ask('')).status).toBe(400);
    expect((await ask('   ')).status).toBe(400);
    expect((await ask(42)).status).toBe(400);
    expect((await ask('x'.repeat(201))).status).toBe(400);
    const notJson = await app.request('/api/ask', { method: 'POST', body: 'not json' }, env());
    expect(notJson.status).toBe(400);
  });

  it('/api/ask returns validated settings from the model reply', async () => {
    const reply = '{"date":"2028-04-19","slip_days":3,"window_days":14,"site":"haworth"}';
    const res = await ask('slip 3 days from 19 April, two weeks at Haworth', env(reply));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      intent: { date: '2028-04-19', slip_days: 3, window_days: 14, site: 'haworth' },
    });
  });

  it('/api/ask says so when the reply is unusable or the model fails', async () => {
    expect((await ask('capital of France?', env('Paris.'))).status).toBe(422);
    expect((await ask('x', env('{"date":"1999-01-01","site":"mars"}'))).status).toBe(422);
    expect((await ask('x', env(new Error('model down')))).status).toBe(503);
  });
});

describe('/etiles (Moon Trek tiles)', () => {
  const real = globalThis.fetch;
  const calls: string[] = [];
  const stub = (status = 200) => {
    calls.length = 0;
    globalThis.fetch = ((u: RequestInfo | URL) => {
      calls.push(String(u));
      return Promise.resolve(
        status === 200
          ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
          : new Response('x', { status }),
      );
    }) as typeof fetch;
  };
  const get = (path: string) =>
    app.request(path, {}, env(), {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as never);

  it('answers 404 for anything outside the grid, without calling NASA', async () => {
    stub();
    for (const p of [
      '/etiles/wac/9/0/0', // WAC stops at zoom 8
      '/etiles/lola/6/0/0', // LOLA stops at zoom 5
      '/etiles/wac/0/1/0', // zoom 0 has one row
      '/etiles/wac/0/0/2', // and two columns
      '/etiles/wac/3/8/0', // 2^3 rows
      '/etiles/wac/3/0/16', // 2^4 columns
      '/etiles/wac/x/0/0',
      '/etiles/wac/01/0/0',
      '/etiles/wac/-1/0/0',
      '/etiles/moon/0/0/0',
      '/etiles/constructor/0/0/0',
    ]) {
      expect((await get(p)).status, p).toBe(404);
    }
    expect(calls).toEqual([]);
    globalThis.fetch = real;
  });

  it('fetches a valid tile from Moon Trek and says to keep it for a week', async () => {
    stub();
    const res = await get('/etiles/wac/8/255/511');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(calls[0]).toBe(
      'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/8/255/511.jpg',
    );
    globalThis.fetch = real;
  });

  it('shares one NASA fetch between simultaneous requests, and passes a 404 on', async () => {
    stub();
    const [a, b] = await Promise.all([get('/etiles/lola/5/10/20'), get('/etiles/lola/5/10/20')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(
      'LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/5/10/20.png',
    );
    stub(404);
    expect((await get('/etiles/lola/5/11/21')).status).toBe(404);
    stub(500);
    const bad = await get('/etiles/lola/5/12/22');
    expect(bad.status).toBe(502);
    expect(bad.headers.get('cache-control')).toBe('no-store');
    globalThis.fetch = real;
  });

  it('sits behind the password gate', async () => {
    stub();
    const res = await app.request('/etiles/wac/0/0/0', {}, env('{}', 'secret'));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
    globalThis.fetch = real;
  });
});
