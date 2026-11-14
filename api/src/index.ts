import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';

type Env = {
  ASSETS: Fetcher;
  /** Weekend-only password gate. Unset (wrangler secret delete SITE_PASSWORD) and the site is open. */
  SITE_PASSWORD?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const password = c.env.SITE_PASSWORD;
  if (!password) return next();
  return basicAuth({ username: 'fourlights', password, realm: 'Four Lights' })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
