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

export function loadSite(id: string): Promise<SiteData> {
  let p = siteCache.get(id);
  if (!p) {
    p = getJson<SiteData>(`/data/sites/${encodeURIComponent(id)}.json`);
    siteCache.set(id, p);
    p.catch(() => siteCache.delete(id));
  }
  return p;
}
