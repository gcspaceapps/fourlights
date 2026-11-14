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
