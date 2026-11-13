// The published data contract. Source of truth: _shared/stack.md (field docs in
// stages/01_data/CONTEXT.md). Change all three and the pipeline together.

/** Degrees clockwise from true north at the site, [0, 360). */
export type AzimuthDeg = number;
/** Degrees above the local horizontal plane (negative = below). */
export type ElevationDeg = number;

/** One entry of `/data/sites.json`. */
export interface SiteSummary {
  /** Stable kebab-case id; the per-site file is `/data/sites/<id>.json`. */
  id: string;
  name: string;
  /** Planetocentric latitude, degrees (negative = south). */
  lat: number;
  /** East longitude, degrees, (-180, 180]. */
  lon_e: number;
  /** South polar stereographic X, metres (IAU_2015:30135, R = 1737.4 km). */
  ps_x_m: number;
  /** South polar stereographic Y, metres (IAU_2015:30135, R = 1737.4 km). */
  ps_y_m: number;
  /** Where the site comes from, e.g. "PGDA Site04" or "Artemis region (USGS grid)". */
  source: string;
  /** How the site pixel was picked (shown in the UI). */
  point_rule: string;
  /** True when no 5 m terrain lies under the site; the UI labels it. */
  approx: boolean;
}

/** The whole of `/data/sites.json`. */
export type SitesIndex = SiteSummary[];

/** Terrain horizon for one observer height. */
export interface HorizonProfile {
  /** Observer height above the surface, metres (1, 2 or 5). */
  height_m: number;
  /** Sector width, always 0.5. */
  step_deg: 0.5;
  /**
   * 720 values. `elev_deg[i]` is the HIGHEST terrain elevation anywhere in the
   * sector starting at azimuth `i * step_deg`. Rounded to 0.01°.
   */
  elev_deg: ElevationDeg[];
}

/** Regular UTC time grid shared by every series in a file. */
export interface TimeGrid {
  /** ISO 8601 UTC, e.g. "2028-01-01T00:00:00Z". */
  start_utc: string;
  /** 60 for product and validation files, 1 for the photo-window files. */
  step_min: number;
  /** Number of steps; every series array has this length. */
  n: number;
}

/** Apparent azimuth and elevation of a body from the site, one value per time step. */
export interface BodyTrack {
  az: AzimuthDeg[];
  el: ElevationDeg[];
}

export interface DemRing {
  /** Product name, e.g. "PGDA Site04 5 m", "LDEM_85S_20M". */
  source: string;
  /** Pixel size, metres. */
  res_m: number;
  /** Outer distance this ring is used to, km. */
  max_km: number;
}

export interface SiteMeta {
  /** The DEM rings actually used, finest first. */
  dem_rings: DemRing[];
  ephem: 'Horizons DE441' | 'SPICE DE440s' | 'fake';
  frame: 'MOON_ME';
  /** ISO 8601 UTC build time. */
  built_utc: string;
}

/** Bitmask per hour: bit 0 Goldstone DSS-14, bit 1 Canberra DSS-43, bit 2 Madrid DSS-63. */
export const STATION_BITS = { goldstone: 1, canberra: 2, madrid: 4 } as const;

/** `/data/sites/<id>.json`, and the same shape under `/data/validation/`. */
export interface SiteData {
  id: string;
  site: { lat: number; lon_e: number; elev_m: number };
  horizons: HorizonProfile[];
  times: TimeGrid;
  sun: BodyTrack;
  earth: BodyTrack;
  /** Canberra Link only: one station bitmask per time step (Moon at >= 10° elevation). */
  stations?: number[];
  meta: SiteMeta;
}
