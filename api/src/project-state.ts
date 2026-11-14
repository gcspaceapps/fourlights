// A shared project's state and the rules for changing it. Pure: no Cloudflare types, so the browser
// and the tests can import it too. The Durable Object (project.ts) stores what this returns and
// sends what it says to send.
//
// The state has two halves:
//  - `data`: what the project IS (the selected site, the landing date, the window, the power
//    system) plus its `sites`. Always shared.
//  - `view`: where each person is LOOKING (tab, Mission/Explore/Learn, the chart's centre and time,
//    the Moon's layer and camera). Shared while a person's "follow the group" switch is on.
// Every value is validated here: the Durable Object is reachable by anyone holding the project's
// uuid (a person's browser, or an AI agent), so nothing is trusted.

export const DEFAULT_SITE = 'peak-near-shackleton';
export const MAX_SITES = 50;
export const MAX_NAME = 40;
export const MAX_PROJECT_NAME = 60;
export const MAX_PEERS = 20;
export const MAX_MESSAGE_BYTES = 8192;

/** A site added to the project. Only a name and a position, like a browser-only user site. */
export interface ProjectSite {
  id: string;
  name: string;
  lat: number;
  lon_e: number;
}

export interface Camera {
  lon: number;
  lat: number;
  D: number;
  bearing: number;
  pitch: number;
}

/** Strings where the page's own controls hold strings, so the page can copy them straight over. */
export interface DataState {
  site: string;
  date: string;
  days: string;
  /**
   * Days the landing date is slipped from the planned landing (negative: brought forward).
   * `date` is the landing shown; the plan is `date` less this.
   */
  slip: string;
  height: string;
  /** '' = leave the page's power system as it is. */
  preset: string;
  /** 'array_day_dark_battery' as in the URL hash, or '' = the preset's own values. */
  power: string;
}

export interface ViewState {
  tab: string;
  mode: 'mission' | 'explore' | 'learn';
  centre: string;
  time: string;
  layer: 'wac' | 'lola' | 'hillshade';
  grid: boolean;
  cam: Camera | null;
}

export interface ProjectState {
  id: string;
  name: string;
  created: string;
  sites: ProjectSite[];
  data: DataState;
  view: ViewState;
}

export const DEFAULT_DATA: DataState = {
  site: DEFAULT_SITE,
  date: '2028-04-19',
  days: '7',
  slip: '0',
  height: '2',
  preset: '',
  power: '',
};

export const DEFAULT_VIEW: ViewState = {
  tab: 'planner',
  mode: 'explore',
  centre: '0',
  time: '0',
  layer: 'wac',
  grid: true,
  cam: null,
};

export const DATA_KEYS = Object.keys(DEFAULT_DATA) as (keyof DataState)[];
export const VIEW_KEYS = Object.keys(DEFAULT_VIEW) as (keyof ViewState)[];

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, lo: number, hi: number): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined;

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NUMBER = '\\d{1,6}(?:\\.\\d{1,6})?';

const DATA_RULES: { [K in keyof DataState]: (x: unknown) => DataState[K] | undefined } = {
  site: (x) => (typeof x === 'string' && ID.test(x) ? x : undefined),
  date: (x) =>
    typeof x === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    new Date(`${x}T00:00:00Z`).toISOString().startsWith(x)
      ? x
      : undefined,
  days: (x) => (typeof x === 'string' && /^\d{1,3}$/.test(x) && Number(x) > 0 ? x : undefined),
  slip: (x) => (typeof x === 'string' && /^(?:0|-?[1-9]\d{0,2})$/.test(x) ? x : undefined),
  height: (x) =>
    typeof x === 'string' && /^\d{1,3}(?:\.\d{1,3})?$/.test(x) && Number(x) > 0 ? x : undefined,
  preset: (x) => (typeof x === 'string' && (x === '' || ID.test(x)) ? x : undefined),
  power: (x) =>
    typeof x === 'string' && (x === '' || new RegExp(`^${NUMBER}(?:_${NUMBER}){3}$`).test(x))
      ? x
      : undefined,
};

function cleanCamera(x: unknown): Camera | null | undefined {
  if (x === null) return null;
  if (!isObj(x)) return undefined;
  const lon = num(x.lon, -360, 360);
  const lat = num(x.lat, -90, 90);
  const D = num(x.D, 0, 100);
  const bearing = num(x.bearing, -1e4, 1e4);
  const pitch = num(x.pitch, 0, Math.PI);
  if (lon === undefined || lat === undefined || D === undefined) return undefined;
  if (bearing === undefined || pitch === undefined) return undefined;
  return { lon, lat, D, bearing, pitch };
}

const VIEW_RULES: { [K in keyof ViewState]: (x: unknown) => ViewState[K] | undefined } = {
  tab: (x) => (typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x) ? x : undefined),
  mode: (x) => (x === 'mission' || x === 'explore' || x === 'learn' ? x : undefined),
  centre: (x) => (typeof x === 'string' && /^\d{1,3}$/.test(x) ? x : undefined),
  time: (x) => (typeof x === 'string' && /^\d{1,6}$/.test(x) ? x : undefined),
  layer: (x) => (x === 'wac' || x === 'lola' || x === 'hillshade' ? x : undefined),
  grid: (x) => (typeof x === 'boolean' ? x : undefined),
  cam: cleanCamera,
};

/** The known keys of `input` whose values are valid; everything else is dropped. */
function pick<T extends object>(
  input: unknown,
  rules: { [K in keyof T]: (x: unknown) => T[K] | undefined },
): Partial<T> {
  const out: Partial<T> = {};
  if (!isObj(input)) return out;
  for (const k of Object.keys(rules) as (keyof T)[]) {
    if (!(k in input)) continue;
    const v = rules[k](input[k as string]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const cleanData = (input: unknown): Partial<DataState> => pick(input, DATA_RULES);
export const cleanView = (input: unknown): Partial<ViewState> => pick(input, VIEW_RULES);

/** The keys of `patch` that would change `current`. */
function changed<T extends object>(current: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) {
    if (JSON.stringify(patch[k]) !== JSON.stringify(current[k])) out[k] = patch[k];
  }
  return out;
}

export const cleanName = (x: unknown, max: number): string | undefined => {
  if (typeof x !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s && s.length <= max ? s : undefined;
};

/** Lower-case kebab-case id from a name, the same shape as the browser's (web/src/usersites.ts). */
export function slugOf(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'site'
  );
}

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** A new site, with an id unique among `taken` (the project's ids and the published ones). */
export function makeSite(
  input: { name: unknown; lat: unknown; lon_e: unknown },
  taken: Iterable<string>,
): ProjectSite | undefined {
  const name = cleanName(input.name, MAX_NAME);
  const lat = num(input.lat, -90, 90);
  const lon = num(input.lon_e, -360, 360);
  if (!name || lat === undefined || lon === undefined) return undefined;
  const used = new Set(taken);
  const base = slugOf(name);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return { id, name, lat, lon_e: wrapLon(lon) };
}

/** Sites uploaded when a project is created: up to MAX_SITES valid ones, ids kept when sound. */
export function cleanSites(input: unknown): ProjectSite[] {
  const out: ProjectSite[] = [];
  if (!Array.isArray(input)) return out;
  for (const raw of input.slice(0, MAX_SITES)) {
    if (!isObj(raw)) continue;
    const s = makeSite(
      raw as { name: unknown; lat: unknown; lon_e: unknown },
      out.map((o) => o.id),
    );
    if (!s) continue;
    if (typeof raw.id === 'string' && ID.test(raw.id) && !out.some((o) => o.id === raw.id)) {
      s.id = raw.id;
    }
    out.push(s);
  }
  return out;
}

export function newProject(
  id: string,
  input: { name?: unknown; sites?: unknown; data?: unknown; view?: unknown },
  now: Date,
): ProjectState | undefined {
  const name = cleanName(input.name, MAX_PROJECT_NAME);
  if (!name) return undefined;
  return {
    id,
    name,
    created: now.toISOString(),
    sites: cleanSites(input.sites),
    data: { ...DEFAULT_DATA, ...cleanData(input.data) },
    view: { ...DEFAULT_VIEW, ...cleanView(input.view) },
  };
}

// ───────────────────────────── commands ─────────────────────────────

/** What a person's browser or an AI agent can ask for. */
export type Command =
  | { t: 'set'; data?: unknown; view?: unknown }
  | { t: 'addSite'; name?: unknown; lat?: unknown; lon_e?: unknown; avoid?: unknown }
  | { t: 'removeSite'; id?: unknown; fallback?: unknown };

/** What the Durable Object sends to a browser. */
export type Event =
  | { t: 'set'; data?: Partial<DataState>; view?: Partial<ViewState> }
  | { t: 'sites'; sites: ProjectSite[]; data?: Partial<DataState> };

export type Outcome =
  | {
      ok: true;
      next: ProjectState;
      /** Nothing changed: nothing to store or send. */
      event: Event | null;
      /** Who gets the event: everyone, or everyone except whoever asked. */
      to: 'all' | 'others';
      dataChanged: boolean;
      viewChanged: boolean;
    }
  | { ok: false; error: string };

const fail = (error: string): Outcome => ({ ok: false, error });

export function reduce(state: ProjectState, cmd: unknown): Outcome {
  if (!isObj(cmd) || typeof cmd.t !== 'string') return fail('Not a command.');
  switch (cmd.t) {
    case 'set': {
      const data = changed(state.data, cleanData(cmd.data));
      const view = changed(state.view, cleanView(cmd.view));
      const hasData = Object.keys(data).length > 0;
      const hasView = Object.keys(view).length > 0;
      if (!hasData && !hasView) {
        return {
          ok: true,
          next: state,
          event: null,
          to: 'others',
          dataChanged: false,
          viewChanged: false,
        };
      }
      return {
        ok: true,
        next: { ...state, data: { ...state.data, ...data }, view: { ...state.view, ...view } },
        event: { t: 'set', ...(hasData ? { data } : {}), ...(hasView ? { view } : {}) },
        to: 'others',
        dataChanged: hasData,
        viewChanged: hasView,
      };
    }
    case 'addSite': {
      if (state.sites.length >= MAX_SITES) return fail(`A project holds up to ${MAX_SITES} sites.`);
      const avoid = Array.isArray(cmd.avoid)
        ? cmd.avoid.filter((x): x is string => typeof x === 'string' && ID.test(x)).slice(0, 200)
        : [];
      const site = makeSite(cmd as { name: unknown; lat: unknown; lon_e: unknown }, [
        ...state.sites.map((s) => s.id),
        ...avoid,
      ]);
      if (!site) {
        return fail(
          `A site needs a name (up to ${MAX_NAME} characters), a latitude and a longitude.`,
        );
      }
      const sites = [...state.sites, site];
      // The new site becomes the selected one, as it does when you add one on your own.
      return {
        ok: true,
        next: { ...state, sites, data: { ...state.data, site: site.id } },
        event: { t: 'sites', sites, data: { site: site.id } },
        to: 'all',
        dataChanged: true,
        viewChanged: false,
      };
    }
    case 'removeSite': {
      const id = cmd.id;
      if (typeof id !== 'string' || !state.sites.some((s) => s.id === id)) {
        return fail('No such site in this project.');
      }
      const sites = state.sites.filter((s) => s.id !== id);
      const fallback = DATA_RULES.site(cmd.fallback) ?? DEFAULT_SITE;
      const data = state.data.site === id ? { site: fallback } : undefined;
      return {
        ok: true,
        next: { ...state, sites, data: { ...state.data, ...data } },
        event: { t: 'sites', sites, ...(data ? { data } : {}) },
        to: 'all',
        dataChanged: true,
        viewChanged: false,
      };
    }
    default:
      return fail('Unknown command.');
  }
}
