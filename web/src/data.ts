// Loads the published JSON (see types.ts). Site files are fetched lazily and cached.
import type { PlannerSummary } from './summary';
import type { SiteData, SitesIndex } from './types';

const siteCache = new Map<string, Promise<SiteData>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function loadSites(): Promise<SitesIndex> {
  return getJson<SitesIndex>('/data/sites.json');
}

export interface Reviews {
  model: string;
  provider: string;
  generated_utc: string;
  sites: Record<string, { text: string }>;
}

let reviews: Promise<Reviews | null> | undefined;

/** AI-written site summaries, generated ahead of time; null if the file is missing. */
export function loadReviews(): Promise<Reviews | null> {
  reviews ??= getJson<Reviews>('/data/reviews.json').catch(() => null);
  return reviews;
}

let planner: Promise<PlannerSummary | null> | undefined;

/** The precomputed planner figures; null if the file is missing (the planner then computes). */
export function loadPlannerSummary(): Promise<PlannerSummary | null> {
  planner ??= getJson<PlannerSummary>('/data/planner.json').catch(() => null);
  return planner;
}

/** Sites whose file is not under /data/sites/: a shared project's own computed sites. */
const siteUrls = new Map<string, string>();

/** Say where a site's file is (or, with null, that it is a published one again). */
export function setSiteUrl(id: string, url: string | null): void {
  if ((siteUrls.get(id) ?? null) === url) return;
  if (url) siteUrls.set(id, url);
  else siteUrls.delete(id);
  siteCache.delete(id);
}

export function loadSite(id: string): Promise<SiteData> {
  let p = siteCache.get(id);
  if (!p) {
    p = getJson<SiteData>(siteUrls.get(id) ?? `/data/sites/${encodeURIComponent(id)}.json`);
    siteCache.set(id, p);
    p.catch(() => siteCache.delete(id));
  }
  return p;
}
