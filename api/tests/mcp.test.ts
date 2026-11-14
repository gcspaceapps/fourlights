// The MCP server: the protocol, each tool, and the Worker's /mcp route, against the real project
// rules (reduce) with the Durable Object replaced by a variable.
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { mcpPost, type McpDeps } from '../src/mcp';
import { newProject, reduce, type ProjectState } from '../src/project-state';

const ID = '11111111-1111-4111-8111-111111111111';
const mustProject = (): ProjectState => {
  const p = newProject(ID, { name: 'Review' }, new Date());
  if (!p) throw new Error('project');
  return p;
};
const PLANNER = {
  start_utc: '2028-01-01T00:00:00Z',
  windows: {
    '7': {
      haworth: { u: [70, 50], s: [90, 80], d: [0, 12], v: 'ga' },
      'shackleton-rim': { u: [30, 60], s: [50, 70], d: [20, 5], v: 'ag' },
    },
  },
};
const FILES: Record<string, unknown> = {
  '/data/sites.json': [
    { id: 'haworth', name: 'Haworth', lat: -87, lon_e: 1 },
    { id: 'shackleton-rim', name: 'Shackleton rim', lat: -89.7, lon_e: -156 },
  ],
  '/data/planner.json': PLANNER,
  '/data/reviews.json': { sites: { haworth: { text: 'A fine site.' } } },
};

function setup() {
  let state: ProjectState = mustProject();
  const sent: unknown[] = [];
  const deps: McpDeps = {
    snapshot: (id) => Promise.resolve(id === ID ? state : null),
    command: (_id, cmd) => {
      sent.push(cmd);
      const out = reduce(state, cmd);
      if (!out.ok) return Promise.resolve(out);
      state = out.next;
      return Promise.resolve({ ok: true, changed: out.event !== null });
    },
    data: (path) =>
      path in FILES ? Promise.resolve(FILES[path]) : Promise.reject(new Error(path)),
  };
  return { deps, sent, get: () => state };
}

let n = 0;
async function call(deps: McpDeps, name: string, args: Record<string, unknown> = {}) {
  const res = await mcpPost(
    {
      jsonrpc: '2.0',
      id: ++n,
      method: 'tools/call',
      params: { name, arguments: { project: ID, ...args } },
    },
    deps,
  );
  const r = (res.json as { result: { isError?: boolean; content: { text: string }[] } }).result;
  return { error: r.isError === true, text: r.content[0]?.text ?? '' };
}

describe('protocol', () => {
  it('initializes, lists tools, answers ping, and stays silent for notifications', async () => {
    const { deps } = setup();
    const init = await mcpPost(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      deps,
    );
    expect(init.json).toMatchObject({
      result: { protocolVersion: '2025-03-26', serverInfo: { name: 'fourlights' } },
    });
    const list = (await mcpPost({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, deps)).json as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['get_project', 'switch_tab', 'add_site', 'rank_sites']),
    );
    expect((await mcpPost({ jsonrpc: '2.0', id: 3, method: 'ping' }, deps)).json).toMatchObject({
      result: {},
    });
    expect(await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toEqual({
      status: 202,
    });
    expect((await mcpPost({ jsonrpc: '2.0', id: 4, method: 'nope' }, deps)).json).toMatchObject({
      error: { code: -32601 },
    });
    expect((await mcpPost({ hello: 1 }, deps)).json).toMatchObject({ error: { code: -32600 } });
    expect((await mcpPost([], deps)).status).toBe(400);
  });

  it('answers a batch', async () => {
    const { deps } = setup();
    const res = await mcpPost(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ],
      deps,
    );
    expect(res.json).toHaveLength(1);
  });
});

describe('reading', () => {
  it('reads the project, lists sites, and ranks by usable days', async () => {
    const { deps } = setup();
    expect((await call(deps, 'get_project')).text).toContain('"name": "Review"');
    await call(deps, 'add_site', { name: 'Camp', lat: -88, lon_e: 3 });
    const sites = await call(deps, 'list_sites');
    expect(sites.text).toContain('haworth');
    expect(sites.text).toContain('"camp"');
    const ranked = JSON.parse((await call(deps, 'rank_sites', { date: '2028-01-01' })).text) as {
      ranked: { site: string; usable_days: number }[];
    };
    expect(ranked.ranked.map((r) => r.site)).toEqual(['haworth', 'shackleton-rim']);
    const next = JSON.parse(
      (await call(deps, 'rank_sites', { date: '2028-01-02' })).text,
    ) as typeof ranked;
    expect(next.ranked[0]).toMatchObject({ site: 'shackleton-rim', usable_days: 6 });
  });

  it('summarises a site with its review, by name, and says when there are no figures', async () => {
    const { deps } = setup();
    const s = JSON.parse(
      (await call(deps, 'site_summary', { site: 'Haworth', date: '2028-01-01' })).text,
    );
    expect(s).toMatchObject({
      site: 'haworth',
      review: 'A fine site.',
      figures: { usable_days: 7, sunlit_percent: 90, power_verdict: 'works' },
    });
    const out = JSON.parse(
      (await call(deps, 'site_summary', { site: 'haworth', date: '2031-01-01' })).text,
    );
    expect(out.figures).toMatch(/outside the data range/);
    await call(deps, 'add_site', { name: 'Camp', lat: -88, lon_e: 3 });
    expect((await call(deps, 'site_summary', { site: 'camp' })).text).toMatch(
      /Only the published sites/,
    );
  });
});

describe('changing the project', () => {
  it('sets site, date, window and height through the project commands', async () => {
    const { deps, get } = setup();
    const r = await call(deps, 'set_selection', {
      site: 'Shackleton rim',
      date: '2028-05-02',
      days: 14,
      height: 5,
    });
    expect(r.error).toBe(false);
    expect(get().data).toMatchObject({
      site: 'shackleton-rim',
      date: '2028-05-02',
      days: '14',
      height: '5',
    });
    expect((await call(deps, 'set_selection', { date: '2028-05-02' })).text).toMatch(/Already/);

    // A slip keeps the plan: the date moves and the slip says by how much.
    await call(deps, 'set_selection', { date: '2028-05-05', slip: 3 });
    expect(get().data).toMatchObject({ date: '2028-05-05', slip: '3' });
    // A new date with no slip is a new plan.
    await call(deps, 'set_selection', { date: '2028-06-01' });
    expect(get().data).toMatchObject({ date: '2028-06-01', slip: '0' });
    expect((await call(deps, 'set_selection', { slip: 1.5 })).error).toBe(true);
  });

  it('switches tabs by slug or label, and goes to Learn for a Learn-only tab', async () => {
    const { deps, get } = setup();
    await call(deps, 'switch_tab', { tab: 'Sun-Path Chart' });
    expect(get().view.tab).toBe('sun-path-chart');
    await call(deps, 'switch_tab', { tab: 'try-and-glossary' });
    expect(get().view).toMatchObject({ tab: 'try-and-glossary', mode: 'learn' });
    expect((await call(deps, 'switch_tab', { tab: 'nowhere' })).error).toBe(true);
  });

  it('sets the view, adds a site (selected, not taking a published id) and removes it', async () => {
    const { deps, get } = setup();
    await call(deps, 'set_view', { layer: 'lola', grid: false, time: 12 });
    expect(get().view).toMatchObject({ layer: 'lola', grid: false, time: '12' });
    await call(deps, 'add_site', { name: 'Haworth', lat: -87.5, lon_e: 2 });
    expect(get().sites.map((s) => s.id)).toEqual(['haworth-2']);
    expect(get().data.site).toBe('haworth-2');
    expect((await call(deps, 'remove_site', { site: 'haworth' })).error).toBe(true); // published
    expect((await call(deps, 'remove_site', { site: 'haworth-2' })).error).toBe(false);
    expect(get().sites).toEqual([]);
  });

  it('turns bad input into an error the agent can read, not a crash', async () => {
    const { deps, sent } = setup();
    expect((await call(deps, 'set_selection', { height: 3 })).error).toBe(true);
    expect((await call(deps, 'set_selection', { date: '2028-13-45' })).error).toBe(true);
    expect((await call(deps, 'set_selection', { site: 'atlantis' })).text).toMatch(/Known ids/);
    expect((await call(deps, 'add_site', { name: 'x', lat: 95, lon_e: 0 })).error).toBe(true);
    expect((await call(deps, 'get_project', { project: 'nope' })).text).toMatch(
      /not a project uuid/,
    );
    expect(
      (await call(deps, 'get_project', { project: '22222222-2222-4222-8222-222222222222' })).text,
    ).toMatch(/No project/);
    expect(sent).toHaveLength(1); // only the bad add_site reached the object, which refused it
  });
});

describe('Worker /mcp', () => {
  const room = () => {
    let state = mustProject();
    return {
      snapshot: () => state,
      command: (cmd: unknown) => {
        const out = reduce(state, cmd);
        if (!out.ok) return out;
        state = out.next;
        return { ok: true, changed: out.event !== null };
      },
    };
  };
  const env = () => {
    const r = room();
    return {
      PROJECTS: { getByName: () => r },
      ASSETS: {
        fetch: (req: Request) => {
          const body = FILES[new URL(req.url).pathname];
          return Promise.resolve(body ? Response.json(body) : new Response('', { status: 404 }));
        },
      },
      AI: {},
    };
  };
  const rpc = (path: string, body: unknown, e: ReturnType<typeof env>) =>
    app.request(path, { method: 'POST', body: JSON.stringify(body) }, e);

  it('uses the uuid in the URL as the default project', async () => {
    const e = env();
    const res = await rpc(
      `/mcp/${ID}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'switch_tab', arguments: { tab: 'map' } },
      },
      e,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      result: { content: [{ text: 'Now showing "Map".' }] },
    });
    const read = await rpc(
      `/mcp/${ID}`,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_project' } },
      e,
    );
    expect(JSON.stringify(await read.json())).toContain('current_tab_label');
  });

  it('answers notifications with 202, refuses GET, junk and big bodies', async () => {
    const e = env();
    expect(
      (await rpc('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, e)).status,
    ).toBe(202);
    expect((await app.request('/mcp', {}, e)).status).toBe(405);
    expect((await app.request('/mcp', { method: 'POST', body: '{nope' }, e)).status).toBe(400);
    expect((await app.request('/mcp', { method: 'POST', body: 'x'.repeat(9000) }, e)).status).toBe(
      413,
    );
  });
});
