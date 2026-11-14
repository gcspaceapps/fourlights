// Loads the published JSON (see types.ts). Site files are fetched lazily and cached.
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

export function loadSite(id: string): Promise<SiteData> {
  let p = siteCache.get(id);
  if (!p) {
    p = getJson<SiteData>(`/data/sites/${encodeURIComponent(id)}.json`);
    siteCache.set(id, p);
    p.catch(() => siteCache.delete(id));
  }
  return p;
}
