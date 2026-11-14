// The globe's maths, with no three.js and no DOM, so plain Vitest can test it.
// Coordinates: the Moon has radius 1. `surf(lon, lat)` = (cos lat sin lon, sin lat, cos lat cos lon):
// lon 0 faces +z, east is +x, north is +y.

export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));

/** Point on the unit sphere for east longitude and latitude, in degrees. */
export function surf(lonDeg: number, latDeg: number): Vec3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

/** The inverse of `surf`: longitude in (-180, 180], latitude, both in degrees. */
export function lonLat(v: Vec3): { lon: number; lat: number } {
  const n = norm(v);
  return { lon: Math.atan2(n[0], n[2]) / DEG, lat: Math.asin(clamp(n[1], -1, 1)) / DEG };
}

/** Wrap a longitude into (-180, 180]. */
export const wrapLon = (lon: number): number => {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

/** Where a ray first meets the unit sphere (nearest hit in front of the origin), or null. */
export function rayUnitSphere(origin: Vec3, dir: Vec3): Vec3 | null {
  const d = norm(dir);
  const b = dot(origin, d);
  const c = dot(origin, origin) - 1;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return add(origin, scale(d, t));
}

// ───────────────────────── view state and camera pose ─────────────────────────

export interface View {
  lon: number;
  lat: number;
  /** Distance above the surface, in Moon radii. */
  D: number;
  /** Heading in radians: 0 is north up, positive turns the heading toward east. */
  bearing: number;
  /** Tilt in radians, 0 looking straight down. */
  pitch: number;
}

export const D_MIN = 0.012;
export const D_MAX = 8;
export const PITCH_MAX = 75 * DEG;

/** Surface normal, north and east unit vectors at a point. */
export function basis(lonDeg: number, latDeg: number): { n: Vec3; N: Vec3; E: Vec3 } {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return {
    n: surf(lonDeg, latDeg),
    N: [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)],
    E: [Math.cos(lon), 0, -Math.sin(lon)],
  };
}

/** Where the camera sits and what it looks at: position = n(1 + D cos p) - f D sin p. */
export function cameraPose(v: View): { position: Vec3; target: Vec3; up: Vec3; heading: Vec3 } {
  const { n, N, E } = basis(v.lon, v.lat);
  const f = add(scale(N, Math.cos(v.bearing)), scale(E, Math.sin(v.bearing)));
  const position = sub(scale(n, 1 + v.D * Math.cos(v.pitch)), scale(f, v.D * Math.sin(v.pitch)));
  return { position, target: n, up: f, heading: f };
}

/** Rotate `v` about the unit `axis` by `angle` (Rodrigues). */
function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Surface arc, in Moon radii, that one screen pixel covers at distance D above the surface. */
export const arcPerPixel = (D: number, fovRad: number, viewportH: number): number =>
  (2 * D * Math.tan(fovRad / 2)) / viewportH;

/**
 * Drag by (dx, dy) screen pixels: the target moves along a great circle so the surface stays under
 * the cursor, and the heading is carried along (so a drag across the pole does not spin the view).
 */
export function pan(v: View, dx: number, dy: number, fovRad: number, viewportH: number): View {
  const { n, N, E } = basis(v.lon, v.lat);
  const f = add(scale(N, Math.cos(v.bearing)), scale(E, Math.sin(v.bearing)));
  const right = cross(f, n);
  const k = arcPerPixel(v.D, fovRad, viewportH);
  const move = add(scale(right, -dx * k), scale(f, dy * k));
  const angle = len(move);
  if (angle < 1e-12) return v;
  const dir = scale(move, 1 / angle);
  const axis = norm(cross(n, dir));
  const n2 = rotate(n, axis, angle);
  const f2 = rotate(f, axis, angle);
  const { lon, lat } = lonLat(n2);
  const b2 = basis(lon, lat);
  return { ...v, lon, lat, bearing: Math.atan2(dot(f2, b2.E), dot(f2, b2.N)) };
}

/** The bearing that puts 0°E at the top when looking down on a polar site (0°E toward Earth). */
export const polarBearing = (lonDeg: number): number => -lonDeg * DEG;

/** Shortest signed turn from angle a to angle b, radians. */
export const shortestTurn = (a: number, b: number): number => {
  const d = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
};

export const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Great-circle angle between two surface points, radians. */
export const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(clamp(dot(a, b), -1, 1));

/** Point t of the way along the great circle from a to b (unit vectors). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const w = angleBetween(a, b);
  if (w < 1e-9) return a;
  const s = Math.sin(w);
  return add(scale(a, Math.sin((1 - t) * w) / s), scale(b, Math.sin(t * w) / s));
}

/** Flights shorter than this (radians, about 20°) do not change the heading. */
export const SHORT_HOP = 0.35;

/**
 * The view part-way through a flight from `from` to `to`, t in [0, 1]: the target slides along the
 * great circle, the heading turns the short way, and the distance goes geometrically from one end
 * to the other with a bump in the middle that grows with the distance flown.
 */
export function flightAt(from: View, to: View, t: number): View {
  const e = easeInOut(clamp(t, 0, 1));
  const a = surf(from.lon, from.lat);
  const b = surf(to.lon, to.lat);
  const { lon, lat } = lonLat(slerp(a, b, e));
  const dist = angleBetween(a, b);
  const base = from.D * (to.D / from.D) ** e;
  const bump = 1 + dist * 0.6 * Math.sin(Math.PI * e);
  // A short hop keeps the view's heading, so the globe does not spin. A long flight turns to the
  // new heading only over its last half, once the target is close.
  const late = clamp((e - 0.5) / 0.5, 0, 1);
  const turn = dist < SHORT_HOP ? 0 : late * late * (3 - 2 * late);
  return {
    lon,
    lat,
    D: clamp(base * bump, D_MIN, D_MAX),
    bearing: from.bearing + shortestTurn(from.bearing, to.bearing) * turn,
    pitch: from.pitch + (to.pitch - from.pitch) * e,
  };
}

// ───────────────────────────── tiles (Moon Trek, equirectangular) ─────────────────────────────

export interface TileKey {
  z: number;
  row: number;
  col: number;
}

/** Native maximum zoom of each layer (NASA Moon Trek). */
export const MAX_ZOOM = { wac: 8, lola: 5 } as const;
export type TileLayerId = keyof typeof MAX_ZOOM;

export const tileId = (t: TileKey): string => `${t.z}/${t.row}/${t.col}`;
export const parentOf = (t: TileKey): TileKey | null =>
  t.z === 0 ? null : { z: t.z - 1, row: t.row >> 1, col: t.col >> 1 };
export const childrenOf = (t: TileKey): TileKey[] => [
  { z: t.z + 1, row: t.row * 2, col: t.col * 2 },
  { z: t.z + 1, row: t.row * 2, col: t.col * 2 + 1 },
  { z: t.z + 1, row: t.row * 2 + 1, col: t.col * 2 },
  { z: t.z + 1, row: t.row * 2 + 1, col: t.col * 2 + 1 },
];

/** Grid at zoom z: 2^(z+1) columns by 2^z rows; row 0 is the top (north), col 0 starts at -180°. */
export function tileBounds(t: TileKey): { lonW: number; lonE: number; latN: number; latS: number } {
  const cols = 2 ** (t.z + 1);
  const rows = 2 ** t.z;
  return {
    lonW: -180 + (t.col * 360) / cols,
    lonE: -180 + ((t.col + 1) * 360) / cols,
    latN: 90 - (t.row * 180) / rows,
    latS: 90 - ((t.row + 1) * 180) / rows,
  };
}

/** Which tile segments to build: finer for the big tiles. */
export const tileSegments = (z: number): number => (z <= 2 ? 32 : z <= 4 ? 16 : 8);

/**
 * A tile's mesh as flat arrays: positions (unit sphere), uvs (linear in lon/lat, v = 1 - j/seg),
 * and triangle indices wound (a, c, b) and (b, c, d) so the front faces point outward.
 */
export function tileGeometry(t: TileKey): { position: number[]; uv: number[]; index: number[] } {
  const seg = tileSegments(t.z);
  const { lonW, lonE, latN, latS } = tileBounds(t);
  const position: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      position.push(...surf(lonW + ((lonE - lonW) * i) / seg, latN - ((latN - latS) * j) / seg));
      uv.push(i / seg, 1 - j / seg);
    }
  }
  const index: number[] = [];
  const at = (i: number, j: number): number => j * (seg + 1) + i;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      index.push(a, c, b, b, c, d);
    }
  }
  return { position, uv, index };
}

const boundsCache = new Map<string, { center: Vec3; radius: number; chord: number }>();

/** A tile's centre direction and its angular radius (radians), cached. */
export function tileSphere(t: TileKey): { center: Vec3; radius: number; chord: number } {
  const id = tileId(t);
  const hit = boundsCache.get(id);
  if (hit) return hit;
  const { lonW, lonE, latN, latS } = tileBounds(t);
  const mid = lonLat(surf((lonW + lonE) / 2, (latN + latS) / 2));
  const center = surf(mid.lon, mid.lat);
  let radius = 0;
  for (const lo of [lonW, (lonW + lonE) / 2, lonE]) {
    for (const la of [latN, (latN + latS) / 2, latS]) {
      radius = Math.max(radius, angleBetween(center, surf(lo, la)));
    }
  }
  const out = { center, radius, chord: 2 * Math.sin(Math.min(radius, Math.PI) / 2) };
  if (boundsCache.size > 5000) boundsCache.clear();
  boundsCache.set(id, out);
  return out;
}

export interface LodView {
  /** Camera position in Moon radii from the centre. */
  camera: Vec3;
  fovRad: number;
  viewportH: number;
  /** Is a sphere (centre, radius) inside the view frustum? */
  inFrustum: (center: Vec3, radius: number) => boolean;
}

/** CSS pixels above which a tile is split. */
export const SPLIT_PX = 360;
export const MAX_LEAVES = 400;

/** On-screen height of a tile in CSS pixels. */
export function tileScreenPx(t: TileKey, view: LodView): number {
  const { center, chord } = tileSphere(t);
  const dist = len(sub(view.camera, center));
  const height = Math.max(dist - chord, len(view.camera) - 1, 1e-4);
  const arc = Math.PI / 2 ** t.z;
  return (arc / (2 * height * Math.tan(view.fovRad / 2))) * view.viewportH;
}

/** Is any of a tile possibly in view: not past the horizon and inside the frustum? */
export function tileVisible(t: TileKey, view: LodView): boolean {
  const { center, radius, chord } = tileSphere(t);
  const r = len(view.camera);
  const horizon = Math.acos(clamp(1 / r, -1, 1));
  if (angleBetween(center, norm(view.camera)) > horizon + radius) return false;
  return view.inFrustum(scale(center, 1), chord);
}

/**
 * The tiles to draw: from the two zoom-0 tiles, split a tile while it is taller than SPLIT_PX on
 * screen (down to the layer's native zoom), skipping tiles past the horizon or outside the frustum,
 * and never more than MAX_LEAVES leaves.
 */
export function selectTiles(view: LodView, maxZoom: number, maxLeaves = MAX_LEAVES): TileKey[] {
  const leaves: TileKey[] = [];
  let level: TileKey[] = [
    { z: 0, row: 0, col: 0 },
    { z: 0, row: 0, col: 1 },
  ].filter((t) => tileVisible(t, view));
  while (level.length) {
    const next: TileKey[] = [];
    // Nearest the camera's view centre first, so the budget goes where the user is looking.
    const cam = norm(view.camera);
    level.sort(
      (a, b) => angleBetween(tileSphere(a).center, cam) - angleBetween(tileSphere(b).center, cam),
    );
    for (const t of level) {
      const room = maxLeaves - leaves.length - next.length - 3;
      if (t.z < maxZoom && room >= 0 && tileScreenPx(t, view) > SPLIT_PX) {
        for (const c of childrenOf(t)) if (tileVisible(c, view)) next.push(c);
      } else {
        leaves.push(t);
      }
    }
    level = next;
  }
  return leaves;
}

// ───────────────────────────────────── graticule ─────────────────────────────────────

/** Line spacings, degrees, coarse to fine: the three levels. */
export const GRATICULE_STEPS = [10, 2, 0.25] as const;
/** Meridians stop here; above it only latitude rings are drawn, because meridians converge. */
export const MERIDIAN_LAT_LIMIT = 80;
export const MAX_CELLS = 900;

export interface GraticulePlan {
  level: 0 | 1 | 2;
  step: number;
  latMin: number;
  latMax: number;
  /** Longitude range to draw, degrees; `full` when a pole is in view. */
  lonMin: number;
  lonMax: number;
  full: boolean;
  parallels: number[];
  meridians: number[];
}

/** Angular radius, radians, of the part of the surface the camera sees. */
export function footprintRadius(v: View, fovRad: number): number {
  const horizon = Math.acos(clamp(1 / (1 + v.D), -1, 1));
  const lean = Math.min(fovRad / 2 + v.pitch, 85 * DEG);
  return Math.min(horizon, v.D * Math.tan(lean) * 1.25 + 0.002);
}

const multiples = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++)
    out.push(+(i * step).toFixed(6));
  return out;
};

/**
 * Which graticule lines to draw for a view: the level comes from the distance, coarsened until
 * there are at most MAX_CELLS visible cells. Longitude is widened by 1/cos(lat) and wraps at ±180.
 */
export function graticulePlan(v: View, fovRad: number): GraticulePlan {
  const rho = footprintRadius(v, fovRad) / DEG;
  const latMin = Math.max(-90, v.lat - rho);
  const latMax = Math.min(90, v.lat + rho);
  const poleInView = latMin <= -90 + 1e-6 || latMax >= 90 - 1e-6;
  const worst = Math.min(Math.max(Math.abs(latMin), Math.abs(latMax)), MERIDIAN_LAT_LIMIT);
  const span = poleInView || worst >= 89 ? 180 : Math.min(180, rho / Math.cos(worst * DEG));
  const full = span >= 179.99;
  let level: 0 | 1 | 2 = v.D > 0.9 ? 0 : v.D > 0.12 ? 1 : 2;
  const build = (lv: 0 | 1 | 2): GraticulePlan => {
    const step = GRATICULE_STEPS[lv];
    const lonMin = v.lon - span;
    const lonMax = v.lon + span;
    const parallels = multiples(Math.max(latMin, -90), Math.min(latMax, 90), step).filter(
      (l) => Math.abs(l) < 90,
    );
    const meridians = full
      ? multiples(-180, 179.999, step)
      : multiples(lonMin, lonMax, step).map(wrapLon);
    return { level: lv, step, latMin, latMax, lonMin, lonMax, full, parallels, meridians };
  };
  let plan = build(level);
  while (level > 0 && plan.parallels.length * plan.meridians.length > MAX_CELLS) {
    level = (level - 1) as 0 | 1 | 2;
    plan = build(level);
  }
  return plan;
}

/** A parallel's label, e.g. 84°S, and a meridian's, e.g. 12.5°E. */
export const latLabel = (lat: number): string =>
  `${+Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : lat > 0 ? 'N' : ''}`;
export const lonLabel = (lon: number): string => {
  const w = wrapLon(lon);
  return `${+Math.abs(w).toFixed(2)}°${w < 0 ? 'W' : w > 0 && w < 180 ? 'E' : ''}`;
};

// ─────────────────────────── polar stereographic hillshade patch ───────────────────────────

/** The hillshade image is a square centred on the south pole, half-width 210 km. */
export const HILLSHADE_HALF_M = 210_000;
export const MOON_RADIUS_M = 1_737_400;

/** Projected x, y in metres of a point (south polar stereographic, 0°E up, 90°E right). */
export function stereoXY(lonDeg: number, latDeg: number): { x: number; y: number } {
  const rho = 2 * MOON_RADIUS_M * Math.tan(((90 + latDeg) / 2) * DEG);
  return { x: rho * Math.sin(lonDeg * DEG), y: rho * Math.cos(lonDeg * DEG) };
}

/** Texture coordinates in the hillshade image (v = 1 at the top, which is north/0°E). */
export function hillshadeUV(lonDeg: number, latDeg: number): { u: number; v: number } {
  const { x, y } = stereoXY(lonDeg, latDeg);
  return { u: 0.5 + x / (2 * HILLSHADE_HALF_M), v: 0.5 + y / (2 * HILLSHADE_HALF_M) };
}

/** Latitude of the circle inscribed in the hillshade square (where the patch ends). */
export const HILLSHADE_EDGE_LAT =
  -90 + (2 * Math.atan(HILLSHADE_HALF_M / (2 * MOON_RADIUS_M))) / DEG;

/** The patch as a polar grid of rings and spokes from the pole out to the inscribed circle. */
export function hillshadeGeometry(
  rings = 48,
  spokes = 128,
): { position: number[]; uv: number[]; index: number[] } {
  const position: number[] = [];
  const uv: number[] = [];
  const colatMax = 90 + HILLSHADE_EDGE_LAT; // degrees from the pole
  for (let r = 0; r <= rings; r++) {
    // Denser near the rim where the sphere curves away from the plane.
    const colat = (colatMax * r) / rings;
    for (let s = 0; s <= spokes; s++) {
      const lon = wrapLon(-180 + (360 * s) / spokes);
      const lat = -90 + colat;
      position.push(...surf(lon, lat));
      const t = hillshadeUV(lon, lat);
      uv.push(t.u, t.v);
    }
  }
  const index: number[] = [];
  const at = (r: number, s: number): number => r * (spokes + 1) + s;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < spokes; s++) {
      const a = at(r, s);
      const b = at(r, s + 1);
      const c = at(r + 1, s);
      const d = at(r + 1, s + 1);
      // Outward-facing: as seen from outside the south pole, longitude runs clockwise.
      index.push(a, b, c, b, d, c);
    }
  }
  return { position, uv, index };
}

// ───────────────────────────────────────── markers ─────────────────────────────────────────

/** Index of the marker nearest to a screen point and within `maxPx`, or -1. */
export function nearestMarker(
  markers: { x: number; y: number; visible: boolean }[],
  px: number,
  py: number,
  maxPx = 14,
): number {
  let best = -1;
  let bestD = maxPx;
  markers.forEach((m, i) => {
    if (!m.visible) return;
    const d = Math.hypot(m.x - px, m.y - py);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** On the hemisphere facing the camera: dot(p, camera) > 1 for a unit point p. */
export const facesCamera = (p: Vec3, camera: Vec3): boolean => dot(p, camera) > 1;

/** Sprite height in world units for a wanted pixel height, with sizeAttenuation off. */
export const spriteScale = (px: number, viewportH: number, fovRad: number): number =>
  (px / viewportH) * 2 * Math.tan(fovRad / 2);
