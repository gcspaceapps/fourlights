// The shared project: the rules (project-state.ts) on known answers, the Durable Object class with
// a fake storage and fake sockets (no network, no workerd), and the Worker's /api/projects routes.
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { Project } from '../src/project';
import {
  DEFAULT_DATA,
  DEFAULT_SITE,
  MAX_SITES,
  cleanData,
  cleanSites,
  cleanView,
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
