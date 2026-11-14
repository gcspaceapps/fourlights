import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { serveTile } from './etiles';
import { ASK_MODEL, MAX_QUESTION_CHARS, parseIntent, systemPrompt, type SiteName } from './intent';

type Env = {
  ASSETS: Fetcher;
  /** Workers AI, used only to turn a typed question into planner settings (/api/ask). */
  AI: Ai;
  /** Weekend-only password gate. Unset (wrangler secret delete SITE_PASSWORD) and the site is open. */
  SITE_PASSWORD?: string;
};

/** The published data covers these landing dates (see _shared/stack.md). */
const FIRST_DAY = '2028-01-01';
const LAST_DAY = '2029-12-01';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const password = c.env.SITE_PASSWORD;
  if (!password) return next();
  return basicAuth({ username: 'fourlights', password, realm: 'Four Lights' })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/ask', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const q =
    typeof (body as { q?: unknown } | null)?.q === 'string' ? (body as { q: string }).q.trim() : '';
  if (!q || q.length > MAX_QUESTION_CHARS) {
    return c.json({ ok: false, error: `Ask in up to ${MAX_QUESTION_CHARS} characters.` }, 400);
  }
  const res = await c.env.ASSETS.fetch(new Request(new URL('/data/sites.json', c.req.url)));
  if (!res.ok) return c.json({ ok: false, error: 'Site list unavailable.' }, 500);
  const sites = ((await res.json()) as SiteName[]).map((s) => ({ id: s.id, name: s.name }));
  try {
    const out = (await c.env.AI.run(ASK_MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(sites, FIRST_DAY, LAST_DAY) },
        { role: 'user', content: q },
      ],
      max_tokens: 120,
      temperature: 0,
    })) as { response?: unknown };
    const reply =
      typeof out.response === 'string' ? out.response : JSON.stringify(out.response ?? '');
    const intent = parseIntent(reply, sites, FIRST_DAY, LAST_DAY);
    if (!intent) {
      return c.json(
        { ok: false, error: 'Could not turn that into a date, slip, window or site.' },
        422,
      );
    }
    return c.json({ ok: true, intent, model: ASK_MODEL });
  } catch {
    return c.json(
      { ok: false, error: 'The language model is unavailable; use the controls instead.' },
      503,
    );
  }
});

app.get('/etiles/:layer/:z/:row/:col', (c) =>
  serveTile(c.req.raw, c.req.param(), (p) => c.executionCtx.waitUntil(p)),
);

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
