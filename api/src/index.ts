import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { serveTile } from './etiles';
import { fromBucket, sliceAsset } from './ranges';
import type { Project } from './project';
import { mcpPost, type McpDeps } from './mcp';
import { MAX_MESSAGE_BYTES } from './project-state';
import { ASK_MODEL, MAX_QUESTION_CHARS, parseIntent, systemPrompt, type SiteName } from './intent';

type Env = {
  ASSETS: Fetcher;
  /** Workers AI, used only to turn a typed question into planner settings (/api/ask). */
  AI: Ai;
  /** Weekend-only password gate. Unset (wrangler secret delete SITE_PASSWORD) and the site is open. */
  SITE_PASSWORD?: string;
  /** One Durable Object per shared project, named by its uuid (project.ts). */
  PROJECTS: DurableObjectNamespace<Project>;
  /** The QGIS pack's three 20 m rasters, too big to be static assets (ranges.ts). */
  QGIS_BUCKET?: R2Bucket;
};

export { Project } from './project';

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

// ── Shared projects (see project.ts). The uuid is the key: whoever holds it can open the project. ──
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** An uploaded project (its name, added sites and starting state) stays small. */
const MAX_CREATE_BYTES = 65_536;

/** The published sites' ids, so a site added to a project never takes one of their ids. */
async function publishedIds(c: { env: Env; req: { url: string } }): Promise<string[]> {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/data/sites.json', c.req.url)));
  return res.ok ? ((await res.json()) as SiteName[]).map((s) => s.id) : [];
}

app.post('/api/projects', async (c) => {
  const text = await c.req.text();
  if (text.length > MAX_CREATE_BYTES) return c.json({ ok: false, error: 'Too large.' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // falls through to the 400 below
  }
  if (typeof body !== 'object' || body === null) {
    return c.json({ ok: false, error: 'Send a JSON body with a name.' }, 400);
  }
  const id = crypto.randomUUID();
  const made = await c.env.PROJECTS.getByName(id).create(id, body);
  if (!made) {
    return c.json({ ok: false, error: 'A project needs a name of up to 60 characters.' }, 400);
  }
  return c.json({ ok: true, project: made }, 201);
});

app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) return c.json({ ok: false, error: 'Not a project id.' }, 400);
  const project = await c.env.PROJECTS.getByName(id).snapshot();
  return project
    ? c.json({ ok: true, project })
    : c.json({ ok: false, error: 'No such project.' }, 404);
});

/**
 * Anything that is not a browser (an AI agent's MCP tool, a script) changes a project here, with
 * the same commands the browsers send down their WebSocket; everyone connected sees the change.
 */
app.post('/api/projects/:id/commands', async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) return c.json({ ok: false, error: 'Not a project id.' }, 400);
  const text = await c.req.text();
  if (text.length > MAX_MESSAGE_BYTES) return c.json({ ok: false, error: 'Too large.' }, 413);
  let cmd: unknown;
  try {
    cmd = JSON.parse(text);
  } catch {
    return c.json({ ok: false, error: 'Not JSON.' }, 400);
  }
  if (typeof cmd === 'object' && cmd !== null && (cmd as { t?: unknown }).t === 'addSite') {
    (cmd as { avoid?: unknown }).avoid = await publishedIds(c);
  }
  const stub = c.env.PROJECTS.getByName(id);
  const res = await stub.command(cmd);
  return c.json(res, res.ok ? 200 : 400);
});

app.get('/api/projects/:id/ws', (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) return c.json({ ok: false, error: 'Not a project id.' }, 400);
  return c.env.PROJECTS.getByName(id).fetch(c.req.raw);
});

// ── MCP: an AI agent drives a project through the same Durable Object (mcp.ts). ──
/** Published JSON is the same for every request, so each isolate keeps what it has read. */
const dataCache = new Map<string, Promise<unknown>>();

function mcpDeps(c: { env: Env; req: { url: string } }, defaultProject?: string): McpDeps {
  return {
    defaultProject,
    snapshot: (id) => c.env.PROJECTS.getByName(id).snapshot(),
    command: (id, cmd) => c.env.PROJECTS.getByName(id).command(cmd),
    data: (path) => {
      let hit = dataCache.get(path);
      if (!hit) {
        hit = c.env.ASSETS.fetch(new Request(new URL(path, c.req.url))).then((r) => {
          if (!r.ok) throw new Error(`${path}: ${r.status}`);
          return r.json();
        });
        dataCache.set(path, hit);
        hit.catch(() => dataCache.delete(path));
      }
      return hit;
    },
  };
}

app.post('/mcp/:id?', async (c) => {
  const text = await c.req.text();
  if (text.length > MAX_MESSAGE_BYTES) return c.json({ error: 'Too large.' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON.' } }, 400);
  }
  const out = await mcpPost(body, mcpDeps(c, c.req.param('id')));
  return out.json === undefined ? c.body(null, 202) : c.json(out.json, out.status as 200);
});
// Stateless server: there is no server-to-client stream to open.
app.get('/mcp/:id?', (c) => c.body(null, 405, { Allow: 'POST' }));

app.get('/etiles/:layer/:z/:row/:col', (c) =>
  serveTile(c.req.raw, c.req.param(), (p) => c.executionCtx.waitUntil(p)),
);

// ── The QGIS pack: files QGIS reads a few thousand bytes at a time (ranges.ts). ──
app.on(['GET', 'HEAD'], '/qgis/r2/:key{.+}', (c) =>
  fromBucket(c.req.raw, c.env.QGIS_BUCKET, c.req.param('key')),
);
app.on(['GET', 'HEAD'], '/qgis/*', async (c) =>
  sliceAsset(c.req.raw, await c.env.ASSETS.fetch(c.req.raw)),
);

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
