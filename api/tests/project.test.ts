// The shared project: the rules (project-state.ts) on known answers, the Durable Object class with
// a fake storage and fake sockets (no network, no workerd), and the Worker's /api/projects routes.
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { looksLikeSiteFile, machineConfig, resultKey } from '../src/pipeline';
import { Project } from '../src/project';
import {
  DEFAULT_DATA,
  DEFAULT_SITE,
  MAX_COMPUTED,
  MAX_SITES,
  cleanData,
  cleanSites,
  cleanView,
  computeRefusal,
  makeSite,
  newProject,
  reduce,
  type ProjectState,
} from '../src/project-state';

const ID = '11111111-1111-4111-8111-111111111111';
const fresh = (): ProjectState => {
  const p = newProject(ID, { name: 'Landing review' }, new Date('2026-11-14T00:00:00Z'));
  if (!p) throw new Error('project');
  return p;
};
const ok = (state: ProjectState, cmd: unknown) => {
  const out = reduce(state, cmd);
  if (!out.ok) throw new Error(out.error);
  return out;
};

describe('validation', () => {
  it('keeps only known, well-formed keys', () => {
    expect(
      cleanData({ site: 'haworth', date: '2028-02-30', days: '14', evil: 1, height: '-1' }),
    ).toEqual({ site: 'haworth', days: '14' });
    // The slip from the plan: a whole number of days either way.
    expect(cleanData({ slip: '3' })).toEqual({ slip: '3' });
    expect(cleanData({ slip: '-2' })).toEqual({ slip: '-2' });
    expect(cleanData({ slip: '0' })).toEqual({ slip: '0' });
    for (const bad of ['', '03', '-0', '1.5', '1000', 3, 'three']) {
      expect(cleanData({ slip: bad }), String(bad)).toEqual({});
    }
    expect(cleanView({ tab: 'map', mode: 'nope', grid: false, time: '12', layer: 'lola' })).toEqual(
      {
        tab: 'map',
        grid: false,
        time: '12',
        layer: 'lola',
      },
    );
    expect(cleanView({ cam: { lon: 1, lat: -80, D: 0.5, bearing: 0, pitch: 0 } }).cam).toBeTruthy();
    expect(cleanView({ cam: { lon: 1, lat: -800, D: 0.5, bearing: 0, pitch: 0 } })).toEqual({});
    expect(cleanView({ cam: null })).toEqual({ cam: null });
  });

  it('accepts the page power string, or empty, and nothing else', () => {
    expect(cleanData({ power: '500_50_5_2.5' })).toEqual({ power: '500_50_5_2.5' });
    expect(cleanData({ power: '' })).toEqual({ power: '' });
    expect(cleanData({ power: '1_2_3' })).toEqual({});
  });

  it('makes site ids unique among the project and the published ones, and wraps longitude', () => {
    const s = makeSite({ name: 'Camp Ünique', lat: -89, lon_e: 190 }, ['camp-unique']);
    expect(s).toEqual({ id: 'camp-unique-2', name: 'Camp Ünique', lat: -89, lon_e: -170 });
    expect(makeSite({ name: '', lat: 0, lon_e: 0 }, [])).toBeUndefined();
    expect(makeSite({ name: 'x', lat: 91, lon_e: 0 }, [])).toBeUndefined();
  });

  it('cleans uploaded sites: bad ones dropped, sound ids kept, capped', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `S${i}`, lat: -85, lon_e: i }));
    expect(cleanSites(many)).toHaveLength(MAX_SITES);
    const got = cleanSites([
      { id: 'mine', name: 'Mine', lat: -80, lon_e: 1 },
      { id: 'mine', name: 'Mine', lat: -80, lon_e: 2 },
      { name: 'No lat', lon_e: 0 },
      'junk',
    ]);
    expect(got.map((s) => s.id)).toEqual(['mine', 'mine-2']);
  });

  it('a project needs a name', () => {
    expect(newProject(ID, { name: '   ' }, new Date())).toBeUndefined();
    expect(newProject(ID, { name: 'x'.repeat(61) }, new Date())).toBeUndefined();
    expect(fresh().data).toEqual(DEFAULT_DATA);
  });
});

describe('commands', () => {
  it('set: only real changes are stored and sent, and only to the others', () => {
    const s = fresh();
    const out = ok(s, {
      t: 'set',
      data: { site: 'haworth', date: s.data.date },
      view: { tab: 'map' },
    });
    expect(out.event).toEqual({ t: 'set', data: { site: 'haworth' }, view: { tab: 'map' } });
    expect(out.to).toBe('others');
    expect(out.dataChanged && out.viewChanged).toBe(true);
    expect(ok(out.next, { t: 'set', data: { site: 'haworth' } }).event).toBeNull();
  });

  it('addSite selects the new site and tells everyone, the asker too', () => {
    const out = ok(fresh(), { t: 'addSite', name: 'Camp One', lat: -88.5, lon_e: 10 });
    expect(out.next.sites).toEqual([{ id: 'camp-one', name: 'Camp One', lat: -88.5, lon_e: 10 }]);
    expect(out.next.data.site).toBe('camp-one');
    expect(out.event).toMatchObject({ t: 'sites', data: { site: 'camp-one' } });
    expect(out.to).toBe('all');
  });

  it('addSite avoids published ids and refuses past the cap or bad input', () => {
    const out = ok(fresh(), {
      t: 'addSite',
      name: 'Haworth',
      lat: -87,
      lon_e: 5,
      avoid: ['haworth'],
    });
    expect(out.next.sites[0]?.id).toBe('haworth-2');
    expect(reduce(fresh(), { t: 'addSite', name: 'x' }).ok).toBe(false);
    const full = {
      ...fresh(),
      sites: cleanSites(
        Array.from({ length: MAX_SITES }, (_, i) => ({ name: `S${i}`, lat: -85, lon_e: i })),
      ),
    };
    expect(reduce(full, { t: 'addSite', name: 'one more', lat: -85, lon_e: 0 }).ok).toBe(false);
  });

  it('removeSite moves the selection off the removed site', () => {
    const a = ok(fresh(), { t: 'addSite', name: 'Camp One', lat: -88, lon_e: 1 }).next;
    const out = ok(a, { t: 'removeSite', id: 'camp-one', fallback: 'haworth' });
    expect(out.next.sites).toEqual([]);
    expect(out.next.data.site).toBe('haworth');
    expect(ok(a, { t: 'removeSite', id: 'camp-one' }).next.data.site).toBe(DEFAULT_SITE);
    expect(reduce(a, { t: 'removeSite', id: 'nope' }).ok).toBe(false);
  });

  it('refuses what it does not understand', () => {
    expect(reduce(fresh(), 'x').ok).toBe(false);
    expect(reduce(fresh(), { t: 'drop tables' }).ok).toBe(false);
  });
});

// ── the Durable Object, with a fake storage and fake sockets ──
class FakeSocket {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  send(t: string): void {
    this.sent.push(JSON.parse(t) as Record<string, unknown>);
  }
  close(): void {
    this.readyState = 3;
  }
  last(t: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function room(store = new Map<string, unknown>()) {
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  const ctx = {
    storage: {
      get: (k: string) => Promise.resolve(store.get(k)),
      put: (k: string, v: unknown) => Promise.resolve(void store.set(k, structuredClone(v))),
      delete: (k: string) => Promise.resolve(store.delete(k)),
      getAlarm: () => Promise.resolve(alarm),
      setAlarm: (t: number) => Promise.resolve(void (alarm = t)),
    },
    blockConcurrencyWhile: (f: () => Promise<void>) => f(),
    acceptWebSocket: (s: FakeSocket) => void sockets.push(s),
    getWebSockets: () => sockets,
  };
  const obj = new Project(ctx as never, {});
  const join = async (): Promise<FakeSocket> => {
    await Promise.resolve(); // the constructor's load
    const s = new FakeSocket();
    obj.attach(s as never);
    return s;
  };
  return { obj, join, store, alarmSet: () => alarm !== null };
}

describe('Project Durable Object', () => {
  it('create makes the project once; a joiner gets the whole state', async () => {
    const { obj, join } = room();
    expect(
      await obj.create(ID, { name: 'Review', sites: [{ name: 'Camp', lat: -88, lon_e: 3 }] }),
    ).toMatchObject({
      name: 'Review',
    });
    expect(await obj.create(ID, { name: 'Again' })).toBeNull();
    const a = await join();
    expect(a.last('snapshot')).toMatchObject({ id: ID, name: 'Review', peers: 1 });
    expect((a.last('snapshot')?.sites as unknown[]).length).toBe(1);
  });

  it('shows one person’s change to the others, not back to them', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review' });
    const a = await join();
    const b = await join();
    expect(a.last('peers')).toMatchObject({ n: 2 });
    await obj.webSocketMessage(
      a as never,
      JSON.stringify({ t: 'set', view: { tab: 'map' }, data: { site: 'haworth' } }),
    );
    expect(b.last('set')).toEqual({ t: 'set', data: { site: 'haworth' }, view: { tab: 'map' } });
    expect(a.last('set')).toBeUndefined();
  });

  it('a new site reaches everyone, including the person who added it', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review' });
    const a = await join();
    const b = await join();
    await obj.webSocketMessage(
      a as never,
      JSON.stringify({ t: 'addSite', name: 'Camp', lat: -88, lon_e: 3 }),
    );
    for (const s of [a, b]) expect(s.last('sites')).toMatchObject({ data: { site: 'camp' } });
  });

  it('an outside command (an agent) reaches every browser', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review' });
    const a = await join();
    expect(await obj.command({ t: 'set', view: { tab: 'planner' } })).toEqual({
      ok: true,
      changed: false,
    });
    expect(await obj.command({ t: 'set', view: { tab: 'battery' } })).toEqual({
      ok: true,
      changed: true,
    });
    expect(a.last('set')).toMatchObject({ view: { tab: 'battery' } });
    expect(await obj.command({ t: 'nope' })).toMatchObject({ ok: false });
  });

  it('answers bad messages with an error and changes nothing', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review' });
    const a = await join();
    await obj.webSocketMessage(a as never, 'not json');
    await obj.webSocketMessage(a as never, JSON.stringify({ t: 'set', data: { site: '../x' } }));
    await obj.webSocketMessage(a as never, 'x'.repeat(9000));
    expect(a.sent.filter((m) => m.t === 'error')).toHaveLength(2);
    expect(obj.snapshot()?.data.site).toBe(DEFAULT_SITE);
  });

  it('keeps the project across eviction; the view is saved by the alarm', async () => {
    const r = room();
    await r.obj.create(ID, { name: 'Review' });
    await r.obj.command({ t: 'set', data: { date: '2028-05-01' }, view: { tab: 'map' } });
    expect(r.alarmSet()).toBe(true);
    await r.obj.alarm();
    const back = room(r.store);
    await new Promise((r) => setTimeout(r, 0)); // the constructor's load
    expect(back.obj.snapshot()).toMatchObject({
      name: 'Review',
      data: { date: '2028-05-01' },
      view: { tab: 'map' },
    });
  });

  it('counts people leaving', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review' });
    const a = await join();
    const b = await join();
    obj.webSocketClose(b as never, 1000);
    expect(a.last('peers')).toMatchObject({ n: 1 });
  });
});

// ── the Worker's routes ──
function env() {
  const rooms = new Map<string, ReturnType<typeof room>>();
  return {
    PROJECTS: {
      getByName: (n: string) => {
        let r = rooms.get(n);
        if (!r) rooms.set(n, (r = room()));
        return r.obj;
      },
    },
    ASSETS: { fetch: () => Promise.resolve(Response.json([{ id: 'haworth', name: 'Haworth' }])) },
    AI: {},
  };
}
const post = (path: string, body: unknown, e: ReturnType<typeof env>) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body) }, e);

describe('Worker /api/projects', () => {
  it('creates a project, reads it back by uuid, and takes commands for it', async () => {
    const e = env();
    const made = await post(
      '/api/projects',
      { name: 'Review', sites: [{ name: 'Camp', lat: -88, lon_e: 3 }] },
      e,
    );
    expect(made.status).toBe(201);
    const { project } = (await made.json()) as { project: { id: string } };
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    const got = await app.request(`/api/projects/${project.id}`, {}, e);
    expect(await got.json()).toMatchObject({ ok: true, project: { name: 'Review' } });
    const cmd = await post(
      `/api/projects/${project.id}/commands`,
      { t: 'addSite', name: 'Haworth', lat: -87, lon_e: 1 },
      e,
    );
    expect(cmd.status).toBe(200);
    const after = (await (await app.request(`/api/projects/${project.id}`, {}, e)).json()) as {
      project: { sites: { id: string }[] };
    };
    // the published "haworth" is not taken over
    expect(after.project.sites.map((s) => s.id)).toEqual(['camp', 'haworth-2']);
  });

  it('refuses a nameless project, a bad id and an unknown project', async () => {
    const e = env();
    expect((await post('/api/projects', { name: '' }, e)).status).toBe(400);
    expect((await app.request('/api/projects/not-a-uuid', {}, e)).status).toBe(400);
    expect((await app.request(`/api/projects/${ID}`, {}, e)).status).toBe(404);
    expect((await post(`/api/projects/${ID}/commands`, { t: 'set' }, e)).status).toBe(400);
  });
});

// ── a project's own site gets real data (pipeline.ts) ──
describe('computing a project site', () => {
  const site = (id: string, lat: number, status?: 'computing' | 'ready' | 'failed') => ({
    id,
    name: id,
    lat,
    lon_e: 10,
    ...(status ? { status } : {}),
  });

  it('refuses a site that is missing, north of 80°S, already done, or one too many', () => {
    const sites = [site('camp', -88), site('equator', 0), site('done', -85, 'ready')];
    expect(computeRefusal(sites, 'camp')).toBeNull();
    expect(computeRefusal(sites, 'nope')).toMatch(/No such site/);
    expect(computeRefusal(sites, 'equator')).toMatch(/80°S/);
    expect(computeRefusal(sites, 'done')).toMatch(/already has its data/);
    const full = [
      site('camp', -88),
      ...Array.from({ length: MAX_COMPUTED }, (_, i) => site(`s${i}`, -85, 'ready')),
    ];
    expect(computeRefusal(full, 'camp')).toMatch(/up to/);
    // A failed run does not use up a place, and may be asked for again.
    expect(computeRefusal([site('camp', -88, 'failed'), site('x', -85, 'failed')], 'camp')).toBe(
      null,
    );
  });

  it('a command cannot set a site’s status: only the run can', () => {
    const made = makeSite({ name: 'Camp', lat: -88, lon_e: 3, status: 'ready' } as never, []);
    expect(made).toEqual({ id: 'camp', name: 'Camp', lat: -88, lon_e: 3 });
    expect(
      cleanSites([{ name: 'Camp', lat: -88, lon_e: 3, status: 'ready' }])[0],
    ).not.toHaveProperty('status');
  });

  it('the Durable Object marks the site, takes the result only with the token, and tells everyone', async () => {
    const { obj, join } = room();
    await obj.create(ID, { name: 'Review', sites: [{ name: 'Camp', lat: -88, lon_e: 3 }] });
    const a = await join();
    expect(await obj.startCompute('nope', 't1')).toMatchObject({ ok: false });
    expect(await obj.startCompute('camp', 't1')).toMatchObject({
      ok: true,
      site: { id: 'camp', status: 'computing' },
    });
    expect((a.last('sites')?.sites as { status?: string }[])[0]?.status).toBe('computing');
    // A second ask while it runs is refused; a wrong token is not accepted.
    expect(await obj.startCompute('camp', 't2')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already being computed/) as string,
    });
    expect(await obj.jobValid('camp', 't2')).toBe(false);
    expect(await obj.finishCompute('camp', 'wrong', 'ready')).toBe(false);
    expect(await obj.finishCompute('camp', 't1', 'ready')).toBe(true);
    expect(obj.snapshot()?.sites[0]?.status).toBe('ready');
    expect((a.last('sites')?.sites as { status?: string }[])[0]?.status).toBe('ready');
    // The token is spent.
    expect(await obj.finishCompute('camp', 't1', 'failed')).toBe(false);
    expect(obj.snapshot()?.sites[0]?.status).toBe('ready');
  });

  it('tells the machine which site, where the data lives and where to send the result', () => {
    const cfg = machineConfig(
      { FLY_IMAGE: 'registry.example/app:1', FLY_VOLUME: 'vol_1' },
      {
        project: ID,
        site: { id: 'camp', name: 'Base Camp', lat: -88.5, lon_e: 3 },
        token: 'secret',
        origin: 'https://example.test',
      },
    ) as { region: string; config: Record<string, unknown> };
    expect(cfg.region).toBe('syd');
    expect(cfg.config).toMatchObject({
      image: 'registry.example/app:1',
      auto_destroy: true,
      restart: { policy: 'no' },
      mounts: [{ volume: 'vol_1', path: '/app/data' }],
      init: { entrypoint: ['./ops/site-job'], cmd: ['camp', 'Base Camp', '-88.5', '3'] },
      env: { RESULT_URL: `https://example.test/api/pipeline/${ID}/camp`, RESULT_TOKEN: 'secret' },
    });
    expect(looksLikeSiteFile({ id: 'camp', horizons: [], times: {} }, 'camp')).toBe(true);
    expect(looksLikeSiteFile({ id: 'other', horizons: [], times: {} }, 'camp')).toBe(false);
    expect(looksLikeSiteFile('nope', 'camp')).toBe(false);
  });

  /** The Worker with the pipeline switched on: a fake Fly API and a fake bucket. */
  function pipelineEnv(flyStatus = 200, flyBody = '{}') {
    const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
    const objects = new Map<string, string>();
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: (init.headers as Record<string, string>).authorization ?? '',
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return Promise.resolve(new Response(flyBody, { status: flyStatus }));
    }) as never;
    const e = {
      ...env(),
      FLY_API_TOKEN: 'fly-token',
      FLY_APP: 'the-app',
      FLY_IMAGE: 'registry.example/app:1',
      FLY_VOLUME: 'vol_1',
      QGIS_BUCKET: {
        put: (k: string, v: string) => Promise.resolve(void objects.set(k, v)),
        get: (k: string) =>
          Promise.resolve(objects.has(k) ? { body: objects.get(k) as string } : null),
      },
    };
    return { e, calls, objects, restore: () => void (globalThis.fetch = realFetch) };
  }
  const withProject = async (e: ReturnType<typeof env>): Promise<string> => {
    const made = await post(
      '/api/projects',
      { name: 'Review', sites: [{ name: 'Camp', lat: -88, lon_e: 3 }] },
      e,
    );
    return ((await made.json()) as { project: { id: string } }).project.id;
  };

  it('is switched off until the Fly settings are there', async () => {
    const e = env();
    const id = await withProject(e);
    const res = await app.request(`/api/projects/${id}/sites/camp/compute`, { method: 'POST' }, e);
    expect(res.status).toBe(503);
    const after = (await (await app.request(`/api/projects/${id}`, {}, e)).json()) as {
      project: { sites: { id: string; status?: string }[] };
    };
    expect(after.project.sites).toEqual([expect.objectContaining({ id: 'camp' })]);
    expect(after.project.sites[0]?.status).toBeUndefined();
  });

  it('starts a machine, stores the file it sends back, and serves it to the project', async () => {
    const { e, calls, objects, restore } = pipelineEnv();
    try {
      const id = await withProject(e);
      const res = await app.request(
        `/api/projects/${id}/sites/camp/compute`,
        { method: 'POST' },
        e,
      );
      expect(res.status).toBe(202);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://api.machines.dev/v1/apps/the-app/machines');
      expect(calls[0]?.auth).toBe('Bearer fly-token');
      const cfg = calls[0]?.body.config as { env: { RESULT_URL: string; RESULT_TOKEN: string } };
      expect(cfg.env.RESULT_URL).toBe(`http://localhost/api/pipeline/${id}/camp`);
      const put = (token: string, body: unknown) =>
        app.request(
          `/api/pipeline/${id}/camp`,
          {
            method: 'PUT',
            headers: { authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          },
          e,
        );
      const file = { id: 'camp', horizons: [], times: { n: 0 } };
      // No data yet; a wrong token, and a file for another site, are refused.
      expect((await app.request(`/api/projects/${id}/sites/camp.json`, {}, e)).status).toBe(404);
      expect((await put('wrong', file)).status).toBe(403);
      expect((await put(cfg.env.RESULT_TOKEN, { ...file, id: 'other' })).status).toBe(400);
      expect(objects.size).toBe(0);
      expect((await put(cfg.env.RESULT_TOKEN, { ...file, index: { approx: false } })).status).toBe(
        200,
      );
      expect([...objects.keys()]).toEqual([resultKey(id, 'camp')]);
      const got = await app.request(`/api/projects/${id}/sites/camp.json`, {}, e);
      expect(await got.json()).toMatchObject(file);
      const project = (await (await app.request(`/api/projects/${id}`, {}, e)).json()) as {
        project: { sites: { status?: string; approx?: boolean }[] };
      };
      expect(project.project.sites[0]).toMatchObject({ status: 'ready', approx: false });
      // The token cannot be used twice, and a finished site is not computed again.
      expect((await put(cfg.env.RESULT_TOKEN, file)).status).toBe(403);
      expect(
        (await app.request(`/api/projects/${id}/sites/camp/compute`, { method: 'POST' }, e)).status,
      ).toBe(409);
    } finally {
      restore();
    }
  });

  it('marks the site failed when the machine cannot start or reports a failure', async () => {
    const busy = pipelineEnv(422, 'volume is attached to another machine');
    try {
      const id = await withProject(busy.e);
      const url = `/api/projects/${id}/sites/camp/compute`;
      const res = await app.request(url, { method: 'POST' }, busy.e);
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: string }).error).toMatch(/Another site is being/);
      const state = async () =>
        (
          (await (await app.request(`/api/projects/${id}`, {}, busy.e)).json()) as {
            project: { sites: { status?: string }[] };
          }
        ).project.sites[0]?.status;
      expect(await state()).toBe('failed');
    } finally {
      busy.restore();
    }
    const run = pipelineEnv();
    try {
      const id = await withProject(run.e);
      await app.request(`/api/projects/${id}/sites/camp/compute`, { method: 'POST' }, run.e);
      const token = (run.calls[0]?.body.config as { env: { RESULT_TOKEN: string } }).env
        .RESULT_TOKEN;
      const failed = await app.request(
        `/api/pipeline/${id}/camp/failed`,
        { method: 'POST', headers: { authorization: `Bearer ${token}` } },
        run.e,
      );
      expect(failed.status).toBe(200);
      // A failed site may be asked for again.
      expect(
        (await app.request(`/api/projects/${id}/sites/camp/compute`, { method: 'POST' }, run.e))
          .status,
      ).toBe(202);
    } finally {
      run.restore();
    }
  });
});
