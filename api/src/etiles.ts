// Moon Trek tiles for the 3D map: /etiles/<layer>/<z>/<row>/<col>. The browser never talks to NASA
// directly; this route fetches the tile, keeps it in the Cloudflare cache (per data centre, custom
// domain only), shares one upstream fetch between simultaneous requests, and tells the browser to
// keep it for a week. The grid is equirectangular: 2^(z+1) columns by 2^z rows, row 0 at the top.

const BASE = 'https://trek.nasa.gov/tiles/Moon/EQ';

/** NASA Moon Trek layer ids and their native maximum zoom (see _datasets/). */
export const TILE_LAYERS = {
  wac: { id: 'LRO_WAC_Mosaic_Global_303ppd_v02', maxZoom: 8, ext: 'jpg', type: 'image/jpeg' },
  lola: { id: 'LRO_LOLA_ClrShade_Global_128ppd_v04', maxZoom: 5, ext: 'png', type: 'image/png' },
} as const;

type LayerName = keyof typeof TILE_LAYERS;
const CACHE_CONTROL = 'public, max-age=604800';

const whole = (s: string): number | null => (/^(0|[1-9]\d{0,3})$/.test(s) ? Number(s) : null);

/** The upstream URL for a valid tile, or null when the layer, zoom, row or column is out of range. */
export function tileUrl(layer: string, z: string, row: string, col: string): string | null {
  if (!Object.hasOwn(TILE_LAYERS, layer)) return null;
  const L = TILE_LAYERS[layer as LayerName];
  const [zi, ri, ci] = [whole(z), whole(row), whole(col)];
  if (zi === null || ri === null || ci === null || zi > L.maxZoom) return null;
  if (ri >= 2 ** zi || ci >= 2 ** (zi + 1)) return null;
  return `${BASE}/${L.id}/1.0.0/default/default028mm/${zi}/${ri}/${ci}.${L.ext}`;
}

type Upstream = { status: number; body: ArrayBuffer | null; type: string };
/** Simultaneous requests for one tile share a single fetch from NASA (per isolate). */
const inflight = new Map<string, Promise<Upstream>>();

async function fetchUpstream(url: string, fallbackType: string): Promise<Upstream> {
  const res = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 604800 } });
  if (!res.ok) return { status: res.status, body: null, type: '' };
  return {
    status: 200,
    body: await res.arrayBuffer(),
    type: res.headers.get('content-type') ?? fallbackType,
  };
}

const unavailable = (): Response =>
  new Response('Tile service unavailable', {
    status: 502,
    headers: { 'cache-control': 'no-store' },
  });

export async function serveTile(
  req: Request,
  params: { layer: string; z: string; row: string; col: string },
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response> {
  const upstream = tileUrl(params.layer, params.z, params.row, params.col);
  if (!upstream) return new Response('No such tile', { status: 404 });

  // The cache key is the URL only: no cookies or headers, so the password gate (which runs before
  // this) is not bypassed and every signed-in browser shares the same entries.
  const url = new URL(req.url);
  const key = new Request(url.origin + url.pathname, { method: 'GET' });
  const cache =
    typeof caches === 'undefined' ? null : (caches as unknown as { default?: Cache }).default;
  const hit = await cache?.match(key);
  if (hit) return hit;

  let pending = inflight.get(upstream);
  if (!pending) {
    pending = fetchUpstream(upstream, TILE_LAYERS[params.layer as LayerName].type).finally(() =>
      inflight.delete(upstream),
    );
    inflight.set(upstream, pending);
  }
  let got: Upstream;
  try {
    got = await pending;
  } catch {
    return unavailable();
  }
  if (got.status === 404) return new Response('No such tile', { status: 404 });
  if (!got.body) return unavailable();
  const res = new Response(got.body.slice(0), {
    headers: { 'content-type': got.type, 'cache-control': CACHE_CONTROL },
  });
  if (cache) waitUntil(cache.put(key, res.clone()));
  return res;
}
