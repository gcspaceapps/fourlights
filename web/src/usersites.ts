// Sites the visitor adds on the map. They live in this browser only (localStorage) and have no
// computed data yet: every place that lists sites shows them, marked "yours", with "no data yet".
// A user site is only ever a name and a position. If a site with the same id is later published
// in /data/sites.json, the published one replaces it everywhere (see `mergeSites`).
import { stereoXY } from './globe/math';
import type { SiteSummary } from './types';

const STORE = 'fourlights.mySites';

/** Lower-case kebab-case id from a name, the same shape as the published ids. */
export function slugOf(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'site'
  );
}

/** A new user site; the id is unique among `taken`, so a later published file can reuse it. */
export function makeUserSite(
  name: string,
  lat: number,
  lonE: number,
  taken: Iterable<string>,
): SiteSummary {
  const used = new Set(taken);
  const base = slugOf(name);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  const la = Math.max(-90, Math.min(90, lat));
  const lo = ((((lonE + 180) % 360) + 360) % 360) - 180;
  const { x, y } = stereoXY(lo, la);
  return {
    id,
    name: name.trim(),
    lat: la,
    lon_e: lo,
    ps_x_m: x,
    ps_y_m: y,
    source: 'Added by you in this browser',
    point_rule: 'the point you clicked or typed',
    approx: true,
    user: true,
  };
}

export function loadUserSites(): SiteSummary[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (x): x is { name: string; lat: number; lon_e: number; id: string } =>
          !!x &&
          typeof x.id === 'string' &&
          typeof x.name === 'string' &&
          Number.isFinite(x.lat) &&
          Number.isFinite(x.lon_e),
      )
      .map((x) => ({ ...makeUserSite(x.name, x.lat, x.lon_e, []), id: x.id }));
  } catch {
    return [];
  }
}

export function saveUserSites(sites: SiteSummary[]): void {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify(
        sites
          .filter((s) => s.user)
          .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon_e: s.lon_e })),
      ),
    );
  } catch {
    // private window: the sites last until the page closes
  }
}

/** True for a visitor's site that has no computed data to draw (yet). */
export const noDataYet = (s: SiteSummary | undefined): boolean => !!s?.user && s.status !== 'ready';

/** Published sites first; a user site whose id has since been published is dropped. */
export function mergeSites(published: SiteSummary[], mine: SiteSummary[]): SiteSummary[] {
  const ids = new Set(published.map((s) => s.id));
  return [...published, ...mine.filter((s) => !ids.has(s.id))];
}
