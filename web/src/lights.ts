// The four lights, mission window and usable days, exactly as defined in _shared/concept.md.
// Every threshold is a named constant here and nowhere else.
import { STATION_BITS, at, type HorizonProfile, type SiteData } from './types';

/** Power: the site must be sunlit at least this fraction of the mission window... */
export const POWER_MIN_SUNLIT_FRACTION = 0.7;
/** ...and never dark for longer than this many hours in a row. */
export const POWER_MAX_DARK_HOURS = 48;
/**
 * Comms: Earth's centre must be at least this far above the terrain, and (Canberra Link) a DSN
 * 70 m station must have the Moon at least 10° up. The 10° mask is applied in the pipeline.
 */
export const COMMS_MARGIN_DEG = 1;
/** Mission window lengths offered (days); the first is the default. */
export const WINDOW_DAYS = [7, 14, 30] as const;
/** Observer height used unless the user picks another (metres). */
export const DEFAULT_HEIGHT_M = 2;

/** Terrain elevation in the 0.5° sector containing `az`. */
export function terrainAt(h: HorizonProfile, azDeg: number): number {
  const n = h.elev_deg.length;
  const i = Math.floor((((azDeg % 360) + 360) % 360) / h.step_deg) % n;
  return at(h.elev_deg, i);
}

export function profileFor(site: SiteData, heightM: number): HorizonProfile {
  const p = site.horizons.find((h) => h.height_m === heightM) ?? site.horizons[0];
  if (!p) throw new Error(`site ${site.id} has no horizon profiles`);
  return p;
}

export interface InstantLights {
  sun: boolean;
  earth: boolean;
  comms: boolean;
  /** Earth clears the terrain by the Comms margin (before the DSN station test). */
  earthClearForComms: boolean;
  /** DSN stations that see the Moon now; null when the file has no station data. */
  stations: StationName[] | null;
}

export type StationName = keyof typeof STATION_BITS;

/** Stations (Goldstone, Canberra, Madrid) with the Moon at least 10° up at step `i`. */
export function stationsAt(site: SiteData, i: number): StationName[] | null {
  if (!site.stations) return null;
  const mask = at(site.stations, i);
  return (Object.keys(STATION_BITS) as StationName[]).filter((k) => (mask & STATION_BITS[k]) !== 0);
}

export function lightsAt(site: SiteData, h: HorizonProfile, i: number): InstantLights {
  const earthClear = at(site.earth.el, i) - terrainAt(h, at(site.earth.az, i));
  const stations = stationsAt(site, i);
  const earthClearForComms = earthClear >= COMMS_MARGIN_DEG;
  return {
    sun: at(site.sun.el, i) > terrainAt(h, at(site.sun.az, i)),
    earth: earthClear > 0,
    // Canberra Link: with station data, a DSN station must also see the Moon.
    comms: earthClearForComms && (stations === null || stations.length > 0),
    earthClearForComms,
    stations,
  };
}

export interface WindowSummary {
  hours: number;
  sunlitFraction: number;
  longestDarkHours: number;
  power: boolean;
  /** Hours with Sun and Comms both on, divided by 24, to one decimal. */
  usableDays: number;
}

/** Summary of the mission window starting at step `start`, `hours` long (hourly data). */
export function windowSummary(
  site: SiteData,
  h: HorizonProfile,
  start: number,
  hours: number,
): WindowSummary {
  const end = Math.min(site.times.n, start + hours);
  let lit = 0;
  let usable = 0;
  let dark = 0;
  let longestDark = 0;
  for (let i = start; i < end; i++) {
    const l = lightsAt(site, h, i);
    if (l.sun) {
      lit++;
      dark = 0;
    } else {
      dark++;
      longestDark = Math.max(longestDark, dark);
    }
    if (l.sun && l.comms) usable++;
  }
  const n = Math.max(1, end - start);
  const sunlitFraction = lit / n;
  return {
    hours: end - start,
    sunlitFraction,
    longestDarkHours: longestDark,
    power: sunlitFraction >= POWER_MIN_SUNLIT_FRACTION && longestDark <= POWER_MAX_DARK_HOURS,
    usableDays: Math.round((usable / 24) * 10) / 10,
  };
}

/** Index of the time step at or after `t` (clamped to the data). */
export function indexAt(site: SiteData, t: Date): number {
  const t0 = Date.parse(site.times.start_utc);
  const i = Math.round((t.getTime() - t0) / (site.times.step_min * 60_000));
  return Math.max(0, Math.min(site.times.n - 1, i));
}

export function timeAt(site: SiteData, i: number): Date {
  return new Date(Date.parse(site.times.start_utc) + i * site.times.step_min * 60_000);
}
