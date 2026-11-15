// The Four Lights MCP server: an AI agent given a project uuid reads the project, asks about the
// sites, and changes what everyone sees. Every change is a project command (project-state.ts) sent
// to the project's Durable Object, the same path the browsers use, so the rules live in one place
// and everybody connected sees the change at once.
//
// Transport: MCP "Streamable HTTP", the stateless form: each POST carries one JSON-RPC message (or
// a batch) and gets the answer as JSON. No sessions, no SSE, no SDK: the Worker stays small and the
// Durable Object is the only state. The protocol is small enough to speak directly.
import { DEFAULT_SITE, MAX_NAME, MAX_SITES } from './project-state';
import type { CommandResult, ProjectSnapshot } from './project';

/** What the server needs from the outside; the Worker supplies it, tests fake it. */
export interface McpDeps {
  snapshot(id: string): Promise<ProjectSnapshot | null>;
  command(id: string, cmd: unknown): Promise<CommandResult>;
  /** A published JSON file under /data (sites.json, planner.json, reviews.json). */
  data(path: string): Promise<unknown>;
  /** The uuid from the URL (`/mcp/<uuid>`), used when a tool call gives none. */
  defaultProject?: string;
}

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'fourlights', version: '1.0.0' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;

/** The page's tabs (slug = lower-cased label with dashes, see web/src/tabs.ts). */
const TABS: Record<string, { label: string; learn: boolean }> = {
  planner: { label: 'Planner', learn: false },
  map: { label: 'Map', learn: false },
  'sun-path-chart': { label: 'Sun-Path Chart', learn: false },
  'survive-the-night': { label: 'Survive the Night', learn: false },
  'landing-site-details': { label: 'Landing site details', learn: false },
};

const VERDICTS: Record<string, string> = { g: 'works', a: 'marginal', r: 'no power' };

interface PublishedSite {
  id: string;
  name: string;
  lat: number;
  lon_e: number;
  approx?: boolean;
}
interface PlannerFile {
  start_utc: string;
  windows: Record<string, Record<string, { u: number[]; s: number[]; d: number[]; v: string }>>;
}
interface ReviewsFile {
  sites: Record<string, { text: string }>;
}

// ───────────────────────────── tools ─────────────────────────────

type Json = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  run(args: Json, deps: McpDeps): Promise<Json>;
}

class ToolError extends Error {}

const PROJECT_ARG = {
  project: {
    type: 'string',
    description:
      "The project's uuid. Optional when the connection URL already ends in /mcp/<uuid>.",
  },
};
const schema = (properties: Json = {}, required: string[] = []): Json => ({
  type: 'object',
  properties: { ...PROJECT_ARG, ...properties },
  required,
  additionalProperties: false,
});

function projectId(args: Json, deps: McpDeps): string {
  const id = typeof args.project === 'string' && args.project ? args.project : deps.defaultProject;
  if (!id) throw new ToolError('Give the project uuid in the "project" argument.');
  if (!UUID.test(id)) throw new ToolError('That is not a project uuid.');
  return id;
}

async function load(args: Json, deps: McpDeps): Promise<{ id: string; project: ProjectSnapshot }> {
  const id = projectId(args, deps);
  const project = await deps.snapshot(id);
  if (!project) throw new ToolError('No project has that uuid.');
  return { id, project };
}

async function published(deps: McpDeps): Promise<PublishedSite[]> {
  const sites = await deps.data('/data/sites.json');
  return Array.isArray(sites) ? (sites as PublishedSite[]) : [];
}

/** A site by id or by name, among the project's own and the published ones. */
async function findSite(
  deps: McpDeps,
  project: ProjectSnapshot,
  ref: unknown,
): Promise<{ id: string; name: string; lat: number; lon_e: number; own: boolean }> {
  if (typeof ref !== 'string' || !ref.trim()) throw new ToolError('Name a site (id or name).');
  const want = ref.trim().toLowerCase();
  const all = [
    ...project.sites.map((s) => ({ ...s, own: true })),
    ...(await published(deps)).map((s) => ({ ...s, own: false })),
  ];
  const hit = all.find((s) => s.id === want) ?? all.find((s) => s.name.toLowerCase() === want);
  if (!hit) {
    throw new ToolError(
      `No site "${ref}". Known ids: ${all.map((s) => s.id).join(', ')}. (list_sites shows them.)`,
    );
  }
  return hit;
}

function dayIndex(planner: PlannerFile, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(planner.start_utc)) / DAY_MS);
}

const dateArg = (x: unknown, fallback: string): string => {
  const d = typeof x === 'string' && x ? x : fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
    throw new ToolError('Dates are YYYY-MM-DD.');
  }
  return d;
};
const windowArg = (x: unknown, fallback: string): string => {
  const w = x === undefined ? fallback : String(x);
  if (!['7', '14', '30'].includes(w))
    throw new ToolError('The mission window is 7, 14 or 30 days.');
  return w;
};

/** One planner cell, in words an agent can quote. */
function cell(planner: PlannerFile, siteId: string, date: string, window: string): Json | null {
  const row = planner.windows[window]?.[siteId];
  const k = dayIndex(planner, date);
  const u = row?.u[k];
  const s = row?.s[k];
  const d = row?.d[k];
  const v = VERDICTS[row?.v[k] ?? ''];
  if (!row || k < 0 || u === undefined || s === undefined || d === undefined || !v) return null;
  return {
    usable_days: u / 10,
    sunlit_percent: s,
    longest_dark_hours: d,
    power_verdict: v,
  };
}

/** Plain text result, with the structured form alongside for clients that read it. */
function reply(text: string, structured?: Json): Json {
  return {
    content: [{ type: 'text', text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}
const asText = (x: unknown): string => JSON.stringify(x, null, 2);

async function send(deps: McpDeps, id: string, cmd: Json): Promise<{ changed: boolean }> {
  const res = await deps.command(id, cmd);
  if (!res.ok) throw new ToolError(res.error);
  return { changed: res.changed };
}

const DATA_PROPS: Json = {
  site: { type: 'string', description: 'Site id or name (see list_sites).' },
  date: {
    type: 'string',
    description: 'Landing date, YYYY-MM-DD (data covers 2028-01-01 to 2029-12-01).',
  },
  days: { type: 'integer', description: 'Mission window in days: 7, 14 or 30.' },
  slip: {
    type: 'integer',
    description:
      'Days the landing date is slipped from the planned landing (negative: brought forward). The page then shows what the slip cost against the plan. Setting a date without a slip makes that date the plan.',
  },
  height: { type: 'number', description: 'Observer height in metres: 1, 2 or 5.' },
};

const TOOLS: Tool[] = [
  {
    name: 'get_project',
    description:
      'Read the whole project: its name, its own added sites, what is selected (site, landing date, ' +
      'window, observer height, power system) and where the shared view is (tab, mode, chart ' +
      'centre and time cursor, Moon layer). Call this first, and again after people may have ' +
      'changed things.',
    inputSchema: schema(),
    async run(args, deps) {
      const { project } = await load(args, deps);
      const tab = TABS[project.view.tab];
      return reply(
        asText({
          ...project,
          current_tab_label: tab?.label ?? project.view.tab,
        }),
        project as unknown as Json,
      );
    },
  },
  {
    name: 'list_sites',
    description:
      'List the landing sites: the 12 published south-pole sites (with real terrain horizons) and ' +
      'any sites added to this project. Ids are what the other tools take.',
    inputSchema: schema(),
    async run(args, deps) {
      const { project } = await load(args, deps);
      const sites = [
        ...(await published(deps)).map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon_e: s.lon_e,
          kind: 'published',
        })),
        ...project.sites.map((s) => ({ ...s, kind: 'added to this project' })),
      ];
      return reply(asText(sites), { sites });
    },
  },
  {
    name: 'site_summary',
    description:
      'What the published data says about one site on one landing date: usable days in the mission ' +
      'window, share of time the Sun is in view, longest dark spell, the power verdict (works / ' +
      "marginal / no power), and the site's written review. Defaults to the project's selected " +
      'site, date and window. Sites added to a project have no precomputed figures.',
    inputSchema: schema({
      site: DATA_PROPS.site,
      date: DATA_PROPS.date,
      days: { type: 'integer', description: 'Mission window: 7, 14 or 30 days.' },
    }),
    async run(args, deps) {
      const { project } = await load(args, deps);
      const site = await findSite(deps, project, args.site ?? project.data.site);
      const date = dateArg(args.date, project.data.date);
      const window = windowArg(args.days, project.data.days);
      if (site.own) {
        return reply(
          `"${site.name}" was added to this project at ${site.lat}°, ${site.lon_e}°E. Only the ` +
            'published sites have precomputed light figures; open it in the page to see its chart.',
        );
      }
      const planner = (await deps.data('/data/planner.json')) as PlannerFile;
      const reviews = (await deps
        .data('/data/reviews.json')
        .catch(() => null)) as ReviewsFile | null;
      const figures = cell(planner, site.id, date, window);
      const out = {
        site: site.id,
        name: site.name,
        position: { lat: site.lat, lon_e: site.lon_e },
        landing_date: date,
        window_days: Number(window),
        observer_height_m: 2,
        figures: figures ?? 'outside the data range (2028-01-01 to 2029-12-01)',
        review: reviews?.sites[site.id]?.text ?? null,
      };
      return reply(asText(out), out);
    },
  },
  {
    name: 'rank_sites',
    description:
      'Rank the published sites for one landing date and window by usable days (best first), with ' +
      'each site\'s sunlit share, longest dark spell and power verdict. Use it for "which site is ' +
      'best on …" and "what if we slip a week". Defaults to the project\'s date and window.',
    inputSchema: schema({
      date: DATA_PROPS.date,
      days: { type: 'integer', description: 'Mission window: 7, 14 or 30 days.' },
    }),
    async run(args, deps) {
      const { project } = await load(args, deps);
      const date = dateArg(args.date, project.data.date);
      const window = windowArg(args.days, project.data.days);
      const planner = (await deps.data('/data/planner.json')) as PlannerFile;
      const names = new Map((await published(deps)).map((s) => [s.id, s.name]));
      const ranked = Object.keys(planner.windows[window] ?? {})
        .map((id) => ({ site: id, name: names.get(id) ?? id, ...cell(planner, id, date, window) }))
        .filter((r) => 'usable_days' in r)
        .sort((a, b) => Number(b.usable_days) - Number(a.usable_days));
      if (ranked.length === 0) {
        return reply('No figures for that date: the data covers 2028-01-01 to 2029-12-01.');
      }
      return reply(asText({ landing_date: date, window_days: Number(window), ranked }), {
        ranked,
      });
    },
  },
  {
    name: 'set_selection',
    description:
      'Change what the project is about: the selected site, landing date, slip from the plan, ' +
      'mission window or observer height. Everyone connected sees it at once. Give only what changes.',
    inputSchema: schema({ ...DATA_PROPS }),
    async run(args, deps) {
      const { id, project } = await load(args, deps);
      const data: Json = {};
      if (args.site !== undefined) data.site = (await findSite(deps, project, args.site)).id;
      if (args.date !== undefined) data.date = dateArg(args.date, '');
      if (args.slip !== undefined) {
        const n = Number(args.slip);
        if (!Number.isInteger(n) || Math.abs(n) > 365) {
          throw new ToolError('Slip is a whole number of days, at most 365 either way.');
        }
        data.slip = String(n);
      } else if (args.date !== undefined) {
        // A new date with no slip is a new plan.
        data.slip = '0';
      }
      if (args.days !== undefined) data.days = windowArg(args.days, '');
      if (args.height !== undefined) {
        const h = Number(args.height);
        if (![1, 2, 5].includes(h)) throw new ToolError('Observer height is 1, 2 or 5 metres.');
        data.height = String(h);
      }
      if (Object.keys(data).length === 0) throw new ToolError('Nothing to change.');
      const res = await send(deps, id, { t: 'set', data });
      return reply(res.changed ? `Done: ${asText(data)}` : 'Already set that way.');
    },
  },
  {
    name: 'switch_tab',
    description:
      "Show a tab on the pages of people who are following the group's view. Tabs: " +
      Object.entries(TABS)
        .map(([slug, t]) => `${slug} ("${t.label}")`)
        .join(', ') +
      '. The tabs are the same in every view (Mission, Explore, Learn); use set_view for the view.',
    inputSchema: schema(
      { tab: { type: 'string', enum: Object.keys(TABS), description: 'The tab slug.' } },
      ['tab'],
    ),
    async run(args, deps) {
      const { id } = await load(args, deps);
      const raw = typeof args.tab === 'string' ? args.tab.trim().toLowerCase() : '';
      const slug =
        TABS[raw] !== undefined
          ? raw
          : Object.keys(TABS).find((s) => TABS[s]?.label.toLowerCase() === raw);
      const tab = slug ? TABS[slug] : undefined;
      if (!slug || !tab)
        throw new ToolError(`Unknown tab. Choose from: ${Object.keys(TABS).join(', ')}.`);
      const view: Json = { tab: slug, ...(tab.learn ? { mode: 'learn' } : {}) };
      const res = await send(deps, id, { t: 'set', view });
      return reply(
        res.changed ? `Now showing "${tab.label}".` : `"${tab.label}" was already showing.`,
      );
    },
  },
  {
    name: 'set_view',
    description:
      "Change the shared view: the mode (mission, explore, or learn, which is Explore with the guide panel open), the Sun-Path Chart's centre day and " +
      "time cursor, the Moon's layer and graticule. Only people following the group's view see " +
      'it. For tabs use switch_tab.',
    inputSchema: schema({
      mode: { type: 'string', enum: ['mission', 'explore', 'learn'] },
      centre: {
        type: 'integer',
        minimum: 0,
        maximum: 999,
        description: 'Chart centre (a day offset).',
      },
      time: {
        type: 'integer',
        minimum: 0,
        maximum: 999999,
        description: 'Chart time cursor (hours).',
      },
      layer: { type: 'string', enum: ['wac', 'lola', 'hillshade'], description: 'The Moon layer.' },
      grid: { type: 'boolean', description: 'Show the graticule on the Moon.' },
    }),
    async run(args, deps) {
      const { id } = await load(args, deps);
      const view: Json = {};
      for (const k of ['mode', 'layer', 'grid'] as const)
        if (args[k] !== undefined) view[k] = args[k];
      for (const k of ['centre', 'time'] as const)
        if (args[k] !== undefined) view[k] = String(args[k]);
      if (Object.keys(view).length === 0) throw new ToolError('Nothing to change.');
      const res = await send(deps, id, { t: 'set', view });
      return reply(res.changed ? `Done: ${asText(view)}` : 'Already set that way.');
    },
  },
  {
    name: 'add_site',
    description:
      `Add a landing site to the project by name and position (up to ${MAX_SITES} per project). ` +
      'It becomes the selected site and appears for everyone. Latitude is south-negative (the ' +
      'pole region is about -90 to -85); longitude is degrees east.',
    inputSchema: schema(
      {
        name: { type: 'string', maxLength: MAX_NAME },
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon_e: { type: 'number', minimum: -360, maximum: 360 },
      },
      ['name', 'lat', 'lon_e'],
    ),
    async run(args, deps) {
      const { id } = await load(args, deps);
      const taken = (await published(deps)).map((s) => s.id);
      await send(deps, id, {
        t: 'addSite',
        name: args.name,
        lat: args.lat,
        lon_e: args.lon_e,
        avoid: taken,
      });
      const after = await deps.snapshot(id);
      const added = after?.sites[after.sites.length - 1];
      return reply(`Added and selected: ${asText(added)}`, { site: added as unknown as Json });
    },
  },
  {
    name: 'remove_site',
    description:
      "Remove a site that was added to this project (published sites can't be removed). If it was " +
      `selected, the selection falls back to ${DEFAULT_SITE}.`,
    inputSchema: schema({ site: { type: 'string', description: 'Id or name of an added site.' } }, [
      'site',
    ]),
    async run(args, deps) {
      const { id, project } = await load(args, deps);
      const site = await findSite(deps, project, args.site);
      if (!site.own) throw new ToolError('Only sites added to this project can be removed.');
      await send(deps, id, { t: 'removeSite', id: site.id });
      return reply(`Removed "${site.name}".`);
    },
  },
];

// ───────────────────────────── protocol ─────────────────────────────

interface Rpc {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const err = (id: Rpc['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

async function handle(msg: Rpc, deps: McpDeps): Promise<unknown | null> {
  if (
    typeof msg !== 'object' ||
    msg === null ||
    msg.jsonrpc !== '2.0' ||
    typeof msg.method !== 'string'
  ) {
    return err(msg?.id, -32600, 'Invalid request.');
  }
  // A notification has no id and gets no answer.
  if (msg.id === undefined) return null;
  const params = (typeof msg.params === 'object' && msg.params !== null ? msg.params : {}) as Json;
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return ok(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          'Four Lights compares lunar south-pole landing sites and dates by where the Sun and ' +
          "Earth sit against each site's real terrain horizon. You are given a project uuid: pass " +
          'it as "project" to every tool (or connect to /mcp/<uuid>). Start with get_project. ' +
          'Changes you make appear live on every open page of the project.',
      });
    }
    case 'ping':
      return ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (
        typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}
      ) as Json;
      try {
        return ok(msg.id, await tool.run(args, deps));
      } catch (e) {
        // A tool's own failure is a result the agent can read and recover from, not a protocol error.
        const text = e instanceof ToolError ? e.message : 'The tool failed; try again.';
        return ok(msg.id, { isError: true, content: [{ type: 'text', text }] });
      }
    }
    default:
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** One HTTP POST body in, the response to send (null = 202 with no body). */
export async function mcpPost(
  body: unknown,
  deps: McpDeps,
): Promise<{ status: number; json?: unknown }> {
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: 400, json: err(null, -32600, 'Empty batch.') };
    const out = (await Promise.all(body.map((m) => handle(m as Rpc, deps)))).filter(
      (r) => r !== null,
    );
    return out.length ? { status: 200, json: out } : { status: 202 };
  }
  const out = await handle(body as Rpc, deps);
  return out === null ? { status: 202 } : { status: 200, json: out };
}
