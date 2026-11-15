// A project's own site gets real data: the Worker asks a machine outside Cloudflare to run the
// precompute for that one point (the container in pipeline/Dockerfile, on Fly.io), and the machine
// sends the finished site file back here. See pipeline/CONTEXT.md, "On Fly.io".
//
//   POST /api/projects/<uuid>/sites/<site>/compute   start a run (pipeline.ts: startMachine)
//   PUT  /api/pipeline/<uuid>/<site>                 the machine's result, with its one-time token
//   POST /api/pipeline/<uuid>/<site>/failed          the machine could not finish
//   GET  /api/projects/<uuid>/sites/<site>.json      the stored site file
//
// All of it is off until the four PIPELINE_* / FLY_* values are set (wrangler secret put): without
// them the compute route answers 503 and the page says the feature is not switched on. The heavy
// work never runs in the Worker; it only starts the machine and stores what comes back.

export interface PipelineEnv {
  /** A Fly.io token that may start machines in FLY_APP and nothing else. */
  FLY_API_TOKEN?: string;
  FLY_APP?: string;
  /** The image built from pipeline/Dockerfile, e.g. registry.fly.io/<app>:<tag>. */
  FLY_IMAGE?: string;
  /** The volume that holds NASA's files; one machine at a time can mount it. */
  FLY_VOLUME?: string;
  FLY_REGION?: string;
  /** Tests and local runs point this at a stand-in for https://api.machines.dev. */
  FLY_API_BASE?: string;
  /** Sites computed per day (UTC) across every project; DEFAULT_DAILY_RUNS when unset. */
  COMPUTE_DAILY_MAX?: string;
}

export const DEFAULT_DAILY_RUNS = 20;
/** The Durable Object that keeps the day's count: a name no project can have. */
export const RUN_COUNTER = 'run-counter';

export function dailyRuns(env: PipelineEnv): number {
  const n = Number(env.COMPUTE_DAILY_MAX);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_RUNS;
}

export const pipelineReady = (env: PipelineEnv): boolean =>
  !!(env.FLY_API_TOKEN && env.FLY_APP && env.FLY_IMAGE && env.FLY_VOLUME);

/** A finished site file is about half a megabyte. */
export const MAX_RESULT_BYTES = 2_000_000;

export const resultKey = (project: string, site: string): string =>
  `projects/${project}/sites/${site}.json`;

export interface RunRequest {
  project: string;
  site: { id: string; name: string; lat: number; lon_e: number };
  token: string;
  /** Where this Worker is reached from outside, e.g. https://fourlights.gcsa.space. */
  origin: string;
}

/** What the machine is told: the job script, the site, and where to send the result. */
export function machineConfig(env: PipelineEnv, run: RunRequest): Record<string, unknown> {
  const { project, site, token, origin } = run;
  return {
    region: env.FLY_REGION ?? 'syd',
    config: {
      image: env.FLY_IMAGE,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 4096 },
      mounts: [{ volume: env.FLY_VOLUME, path: '/app/data' }],
      init: {
        entrypoint: ['./ops/site-job'],
        cmd: [site.id, site.name, String(site.lat), String(site.lon_e)],
      },
      env: {
        RESULT_URL: `${origin}/api/pipeline/${project}/${site.id}`,
        RESULT_TOKEN: token,
      },
    },
  };
}

/** Start the machine. Resolves to null when it started, or to why it did not. */
export async function startMachine(
  env: PipelineEnv,
  run: RunRequest,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const base = env.FLY_API_BASE ?? 'https://api.machines.dev';
  let res: Response;
  try {
    res = await fetcher(`${base}/v1/apps/${env.FLY_APP}/machines`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.FLY_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(machineConfig(env, run)),
    });
  } catch {
    return 'The compute service could not be reached.';
  }
  if (res.ok) return null;
  // The volume mounts on one machine at a time, so a second run is refused while one is going.
  const text = (await res.text().catch(() => '')).slice(0, 300);
  return /volume|in use|attached/i.test(text)
    ? 'Another site is being computed just now. Try again in a few minutes.'
    : `The compute service refused the run (HTTP ${res.status}).`;
}

/** Enough of a site file to know the machine sent one, for the site it was asked for. */
export function looksLikeSiteFile(x: unknown, siteId: string): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { id?: unknown; horizons?: unknown; times?: unknown };
  return o.id === siteId && Array.isArray(o.horizons) && typeof o.times === 'object';
}
