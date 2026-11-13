// Writes three fake sites into web/public/data/ so the UI can be built before the real
// precompute lands. Scaffolding only: `npm run check:real-data` fails while any remain.
//
// Built-in scenario (planned landing 2028-01-21, mission window 7 days, launch slips 3 days):
// - fake-a: low horizon toward the Sun's path in late January, so it stays lit after the slip.
// - fake-b: a ridge (~3°) the Sun sits behind for ~5 days from ~2028-01-27, so the slipped
//   window has a long night (Power off).
// - fake-c: the same ridge, higher (~3.5°), plus a peak to the north that cuts Comms when
//   Earth dips low in its libration.
//
// Deterministic: same output every run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'web/public/data';
const START_UTC = '2028-01-01T00:00:00Z';
const DAYS = 90;
const N = DAYS * 24;
const SECTORS = 720;
const HEIGHTS_M = [1, 2, 5];
const SYNODIC_DAYS = 29.53;
const LIBRATION_DAYS = 27.21;
const R_MOON_M = 1737400;
const DEG = Math.PI / 180;

const r2 = (x) => Math.round(x * 100) / 100;
const wrap360 = (a) => ((a % 360) + 360) % 360;

/** Seeded PRNG (mulberry32) so the files are reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest angular distance a→b, degrees. */
const angDist = (a, b) => Math.abs(((b - a + 540) % 360) - 180);

/** Flat-topped bump: `peak` within `half` of `centre`, ramping to 0 over `ramp` degrees. */
function plateau(az, centre, half, ramp, peak) {
  const d = angDist(az, centre);
  if (d <= half) return peak;
  if (d >= half + ramp) return 0;
  return peak * 0.5 * (1 + Math.cos((Math.PI * (d - half)) / ramp));
}

// The Sun goes once round the sky per synodic month. Phase chosen so it is behind the
// 150°–211° ridge from day ~26.5 to ~31.5 (and again one synodic month later).
const SUN_AZ0 = 186.94;

function sunTrack(phase) {
  const az = [];
  const el = [];
  for (let i = 0; i < N; i++) {
    const d = i / 24;
    az.push(r2(wrap360(SUN_AZ0 + (360 * d) / SYNODIC_DAYS)));
    // Skims near 1°: a lunar-day wobble plus a slow seasonal drift.
    el.push(
      r2(
        1.0 +
          0.35 * Math.sin((2 * Math.PI * d) / SYNODIC_DAYS + phase) -
          0.25 * Math.sin((2 * Math.PI * d) / 365.25),
      ),
    );
  }
  return { az, el };
}

function earthTrack(phase) {
  const az = [];
  const el = [];
  for (let i = 0; i < N; i++) {
    const d = i / 24;
    const lib = (2 * Math.PI * d) / LIBRATION_DAYS + phase;
    // Earth sits near true north (south-pole site) and bobs around 6° with libration.
    az.push(r2(wrap360(5 * Math.sin(lib + 1.1))));
    el.push(r2(6 + 1.5 * Math.sin(lib)));
  }
  return { az, el };
}

/**
 * Horizon for one site at each observer height. `features(az)` adds ridges; a raised
 * observer sees slightly lower terrain.
 */
function horizons(seed, features) {
  const rand = rng(seed);
  const noise = Array.from({ length: SECTORS }, () => (rand() - 0.5) * 0.1);
  const base = Array.from({ length: SECTORS }, (_, i) => {
    const az = i * 0.5;
    return (
      -0.6 +
      0.25 * Math.sin(3 * az * DEG) +
      0.15 * Math.sin(7 * az * DEG + 1) +
      noise[i] +
      features(az)
    );
  });
  return HEIGHTS_M.map((h) => ({
    height_m: h,
    step_deg: 0.5,
    elev_deg: base.map((e) => r2(e - 0.05 * (h - 1))),
  }));
}

/** South polar stereographic (IAU_2015:30135), metres. */
function polarStereo(latDeg, lonEDeg) {
  const rho = 2 * R_MOON_M * Math.tan(((90 + latDeg) / 2) * DEG);
  return {
    x: Math.round(rho * Math.sin(lonEDeg * DEG)),
    y: Math.round(rho * Math.cos(lonEDeg * DEG)),
  };
}

const RIDGE_CENTRE = 180.5;
const RIDGE_HALF = 28.5;

const sites = [
  {
    id: 'fake-a',
    name: 'Fake A (stays lit)',
    lat: -89.5,
    lon_e: -150,
    elev_m: 1820,
    seed: 11,
    sunPhase: 0.3,
    earthPhase: 0,
    // A ridge the Sun crosses in early January only; nothing on the late-January path.
    features: (az) => plateau(az, 230, 12, 4, 1.8),
  },
  {
    id: 'fake-b',
    name: 'Fake B (ridge, dark after slip)',
    lat: -88.9,
    lon_e: 120,
    elev_m: 1540,
    seed: 22,
    sunPhase: 1.2,
    earthPhase: 0.8,
    features: (az) => plateau(az, RIDGE_CENTRE, RIDGE_HALF, 3, 3.6),
  },
  {
    id: 'fake-c',
    name: 'Fake C (ridge and comms shadow)',
    lat: -86.2,
    lon_e: 10,
    elev_m: 2210,
    seed: 33,
    sunPhase: 2.0,
    earthPhase: 2.4,
    features: (az) => plateau(az, RIDGE_CENTRE, RIDGE_HALF, 3, 4.1) + plateau(az, 0, 4, 2, 6.4),
  },
];

const builtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
mkdirSync(join(OUT, 'sites'), { recursive: true });

const index = sites.map((s) => {
  const ps = polarStereo(s.lat, s.lon_e);
  const data = {
    id: s.id,
    site: { lat: s.lat, lon_e: s.lon_e, elev_m: s.elev_m },
    horizons: horizons(s.seed, s.features),
    times: { start_utc: START_UTC, step_min: 60, n: N },
    sun: sunTrack(s.sunPhase),
    earth: earthTrack(s.earthPhase),
    meta: {
      dem_rings: [{ source: 'fake', res_m: 5, max_km: 200 }],
      ephem: 'fake',
      frame: 'MOON_ME',
      built_utc: builtUtc,
    },
  };
  writeFileSync(join(OUT, 'sites', `${s.id}.json`), JSON.stringify(data));
  return {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon_e: s.lon_e,
    ps_x_m: ps.x,
    ps_y_m: ps.y,
    source: 'fake fixture',
    point_rule: 'fake: fixed point',
    approx: false,
  };
});

writeFileSync(join(OUT, 'sites.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Wrote ${index.length} fake sites (${N} hourly steps from ${START_UTC}) to ${OUT}/`);
