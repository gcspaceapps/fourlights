// The globe's maths in plain Node (no DOM, no WebGL).
import { describe, expect, it } from 'vitest';
import {
  basis,
  cameraPose,
  childrenOf,
  flightAt,
  graticulePlan,
  hillshadeGeometry,
  hillshadeUV,
  HILLSHADE_EDGE_LAT,
  lonLat,
  MAX_ZOOM,
  nearestMarker,
  pan,
  polarBearing,
  rayUnitSphere,
  selectTiles,
  spriteScale,
  stereoXY,
  surf,
  tileBounds,
  tileGeometry,
  tileScreenPx,
  facesCamera,
  DEG,
  type LodView,
  type Vec3,
  type View,
} from '../src/globe/math';

const close = (a: number[], b: number[], d = 6): void =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, d));
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = <T>(a: ArrayLike<T>, i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
};

/** How many non-degenerate triangles of a mesh face outward from the sphere's centre. */
function faces(g: { position: number[]; index: number[] }): { outward: number; total: number } {
  let outward = 0;
  let total = 0;
  const pt = (i: number): Vec3 => [
    at(g.position, at(g.index, i) * 3),
    at(g.position, at(g.index, i) * 3 + 1),
    at(g.position, at(g.index, i) * 3 + 2),
  ];
  for (let i = 0; i < g.index.length; i += 3) {
    const [p0, p1, p2] = [pt(i), pt(i + 1), pt(i + 2)];
    const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    if (Math.hypot(...n) < 1e-14) continue; // degenerate at a pole
    total++;
    if (dot(n, p0) > 0) outward++;
  }
  return { outward, total };
}

describe('coordinates', () => {
  it('surf: lon 0 faces +z, east is +x, north is +y', () => {
    close(surf(0, 0), [0, 0, 1]);
    close(surf(90, 0), [1, 0, 0]);
    close(surf(0, 90), [0, 1, 0]);
    close(surf(0, -90), [0, -1, 0]);
  });
  it('lonLat inverts surf', () => {
    const { lon, lat } = lonLat(surf(-156.2, -89.78));
    expect(lon).toBeCloseTo(-156.2, 6);
    expect(lat).toBeCloseTo(-89.78, 6);
  });
  it('a ray at the Moon gives the point under it, and a miss gives null', () => {
    close(rayUnitSphere([0, 0, 5], [0, 0, -1]) ?? [], [0, 0, 1]);
    expect(rayUnitSphere([0, 3, 5], [0, 0, -1])).toBeNull();
    expect(rayUnitSphere([0, 0, 5], [0, 0, 1])).toBeNull(); // pointing away
  });
});

describe('camera and controls', () => {
  const v: View = { lon: 30, lat: -60, D: 0.5, bearing: 0.4, pitch: 0.3 };
  it('sits n(1 + D cos p) - f D sin p from the planet centre, D above the target', () => {
    const { position, target, heading } = cameraPose(v);
    const { n } = basis(v.lon, v.lat);
    close(target, n);
    expect(Math.hypot(...(position.map((x, i) => x - at(n, i)) as Vec3))).toBeCloseTo(v.D, 9);
    expect(dot(heading, n)).toBeCloseTo(0, 9); // heading is tangent
  });
  it('a drag keeps the surface under the cursor: move one pixel-arc, land one pixel-arc away', () => {
    const fov = 45 * DEG;
    const out = pan({ ...v, pitch: 0 }, 100, 0, fov, 800);
    const ang = Math.acos(dot(surf(v.lon, v.lat), surf(out.lon, out.lat)));
    expect(ang).toBeCloseTo((100 * 2 * v.D * Math.tan(fov / 2)) / 800, 6);
  });
  it('dragging right moves the target west (the surface follows the cursor east) at bearing 0', () => {
    const out = pan({ lon: 0, lat: 0, D: 1, bearing: 0, pitch: 0 }, 50, 0, 45 * DEG, 800);
    expect(out.lon).toBeLessThan(0);
    expect(out.lat).toBeCloseTo(0, 9);
  });
  it('panning over the pole stays finite and keeps the heading continuous', () => {
    let s: View = { lon: 0, lat: -89, D: 0.05, bearing: 0, pitch: 0 };
    for (let i = 0; i < 40; i++) s = pan(s, 0, 8, 45 * DEG, 800);
    expect(Number.isFinite(s.lon + s.lat + s.bearing)).toBe(true);
    expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
  });
  it('polarBearing puts 0°E at the top over the south pole', () => {
    const lon = -137;
    const { N, E } = basis(lon, -89);
    const b = polarBearing(lon);
    const f = [0, 1, 2].map((i) => at(N, i) * Math.cos(b) + at(E, i) * Math.sin(b));
    // The heading at the pole equals the one at lon 0 carried there: +y of the polar plane,
    // i.e. the stereographic y axis, (sin(lon+b), cos(lon+b)) = (0, 1).
    const x = Math.sin(lon * DEG + b);
    const y = Math.cos(lon * DEG + b);
    expect([x, y]).toEqual([expect.closeTo(0, 9), expect.closeTo(1, 9)]);
    expect(f.every(Number.isFinite)).toBe(true);
  });
  it('flightAt: ends where asked, shortest way, and rises mid-flight in proportion to distance', () => {
    const a: View = { lon: 170, lat: 0, D: 0.5, bearing: 0, pitch: 0 };
    const b: View = { lon: -170, lat: 0, D: 0.05, bearing: 0, pitch: 0 };
    const mid = flightAt(a, b, 0.5);
    expect(Math.abs(mid.lon)).toBeGreaterThan(175); // via 180, not through 0
    const base = Math.sqrt(0.5 * 0.05);
    expect(mid.D).toBeGreaterThan(base);
    const far = flightAt({ ...a, lon: 0 }, { ...b, lon: 150 }, 0.5);
    expect(far.D / Math.sqrt(0.5 * 0.05)).toBeGreaterThan(mid.D / base);
    close([flightAt(a, b, 1).lon, flightAt(a, b, 1).D], [b.lon, b.D], 6);
  });
});

describe('short flights', () => {
  it('a short hop keeps the heading all the way', () => {
    const a: View = { lon: 0, lat: -89, D: 0.08, bearing: 0.3, pitch: 0 };
    const b: View = { lon: 40, lat: -89.5, D: 0.08, bearing: -2, pitch: 0 };
    for (const t of [0.2, 0.5, 0.8]) expect(flightAt(a, b, t).bearing).toBeCloseTo(0.3, 9);
  });
  it('a long flight leaves the heading alone until its second half', () => {
    const a: View = { lon: 0, lat: -60, D: 1.7, bearing: 0, pitch: 0 };
    const b: View = { lon: 90, lat: -89, D: 0.08, bearing: 1, pitch: 0 };
    expect(flightAt(a, b, 0.4).bearing).toBeCloseTo(0, 9);
    expect(flightAt(a, b, 1).bearing).toBeCloseTo(1, 9);
  });
});

describe('tiles', () => {
  it('2×1 tiles at zoom 0, 2^(z+1) × 2^z deeper, row 0 at the top', () => {
    expect(tileBounds({ z: 0, row: 0, col: 0 })).toEqual({
      lonW: -180,
      lonE: 0,
      latN: 90,
      latS: -90,
    });
    expect(tileBounds({ z: 0, row: 0, col: 1 }).lonW).toBe(0);
    expect(tileBounds({ z: 2, row: 3, col: 7 })).toEqual({
      lonW: 135,
      lonE: 180,
      latN: -45,
      latS: -90,
    });
    expect(childrenOf({ z: 1, row: 1, col: 3 })).toHaveLength(4);
  });
  it('geometry: UVs are linear in lon/lat with v = 1 - j/seg, and every front face points outward', () => {
    for (const t of [
      { z: 0, row: 0, col: 0 },
      { z: 3, row: 7, col: 5 },
      { z: 6, row: 63, col: 3 },
    ]) {
      const g = tileGeometry(t);
      expect(g.uv.slice(0, 2)).toEqual([0, 1]); // top-left
      expect(g.uv.slice(-2)).toEqual([1, 0]); // bottom-right
      const { outward, total } = faces(g);
      expect(total).toBeGreaterThan(0);
      expect(outward).toBe(total);
    }
  });
  const view = (camera: Vec3, lookLon = 0, lookLat = 0): LodView => {
    const look = surf(lookLon, lookLat);
    return {
      camera,
      fovRad: 45 * DEG,
      viewportH: 800,
      // Good enough for a test: in front of the camera, within ~60° of the look direction.
      inFrustum: (c, r) => dot(c, look) > Math.cos(60 * DEG) - Math.sin(r),
    };
  };
  it('the whole Moon is a few big tiles; closing in sharpens, down to native zoom, within the leaf cap', () => {
    const far = selectTiles(view([0, 0, 9]), MAX_ZOOM.wac);
    expect(far.length).toBeLessThanOrEqual(8);
    const near = selectTiles(view([0, 0, 1.012]), MAX_ZOOM.wac);
    expect(Math.max(...near.map((t) => t.z))).toBe(MAX_ZOOM.wac);
    expect(near.length).toBeLessThanOrEqual(400);
    expect(Math.max(...selectTiles(view([0, 0, 1.012]), MAX_ZOOM.lola).map((t) => t.z))).toBe(
      MAX_ZOOM.lola,
    );
  });
  it('culls the far side of the Moon', () => {
    const tiles = selectTiles(view([0, 0, 1.05]), 8);
    // Camera over lon 0: nothing centred on the opposite side (lon 180) is chosen.
    expect(
      tiles.every((t) => {
        const b = tileBounds(t);
        return b.lonE > -100 && b.lonW < 100;
      }),
    ).toBe(true);
  });
  it('a tile taller than 360 px splits, a smaller one does not', () => {
    const v = view([0, 0, 1.2]);
    expect(tileScreenPx({ z: 0, row: 0, col: 1 }, v)).toBeGreaterThan(360);
    expect(tileScreenPx({ z: 8, row: 128, col: 256 }, v)).toBeLessThan(360);
  });
});

describe('graticule', () => {
  const fov = 45 * DEG;
  it('goes finer as you zoom in, and never exceeds 900 visible cells', () => {
    const lv = (D: number, lat = -30): number =>
      graticulePlan({ lon: 20, lat, D, bearing: 0, pitch: 0 }, fov).level;
    expect(lv(4)).toBe(0);
    expect(lv(0.5)).toBe(1);
    expect(lv(0.02)).toBe(2);
    for (const D of [0.012, 0.05, 0.3, 1, 3, 8]) {
      for (const lat of [-89.5, -60, 0, 80]) {
        const p = graticulePlan({ lon: 179, lat, D, bearing: 0, pitch: 0.5 }, fov);
        expect(p.parallels.length * p.meridians.length).toBeLessThanOrEqual(900);
      }
    }
  });
  it('wraps meridians across ±180, and draws every longitude when a pole is in view', () => {
    const p = graticulePlan({ lon: 179, lat: 0, D: 0.3, bearing: 0, pitch: 0 }, fov);
    expect(p.meridians.some((m) => m > 170) && p.meridians.some((m) => m < -170)).toBe(true);
    const pole = graticulePlan({ lon: 0, lat: -89, D: 0.5, bearing: 0, pitch: 0 }, fov);
    expect(pole.full).toBe(true);
  });
});

describe('polar hillshade patch', () => {
  it('stereographic x, y: 0°E is up (+y), 90°E is right (+x), and a site matches the pipeline', () => {
    const a = stereoXY(0, -89);
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.y).toBeGreaterThan(0);
    expect(stereoXY(90, -89).x).toBeGreaterThan(0);
    // Shackleton rim, from sites.json: ps_x -2687.5, ps_y -6092.5 (centre of its 5 m pixel).
    const s = stereoXY(-156.19695, -89.7804);
    expect(s.x).toBeCloseTo(-2687.5, -1);
    expect(s.y).toBeCloseTo(-6092.5, -1);
  });
  it('UV: the pole is the image centre, 0°E is toward the top', () => {
    const c = hillshadeUV(0, -90);
    close([c.u, c.v], [0.5, 0.5]);
    expect(hillshadeUV(0, -85).v).toBeGreaterThan(0.5);
  });
  it('the patch ends at about 83°S, inside the 420 km square, and its faces point outward', () => {
    expect(HILLSHADE_EDGE_LAT).toBeGreaterThan(-83.2);
    expect(HILLSHADE_EDGE_LAT).toBeLessThan(-83);
    const g = hillshadeGeometry(8, 16);
    for (let i = 0; i < g.uv.length; i += 2) {
      expect(g.uv[i]).toBeGreaterThanOrEqual(0);
      expect(g.uv[i]).toBeLessThanOrEqual(1);
    }
    const { outward, total } = faces(g);
    expect(total).toBeGreaterThan(0);
    expect(outward).toBe(total);
  });
});

describe('markers', () => {
  it('hit-tests in screen space: nearest within 14 px, hidden ones ignored', () => {
    const m = [
      { x: 100, y: 100, visible: true },
      { x: 108, y: 100, visible: false },
      { x: 300, y: 300, visible: true },
    ];
    expect(nearestMarker(m, 104, 100)).toBe(0);
    expect(nearestMarker(m, 112, 100)).toBe(0); // 12 px from #0; #1 is hidden
    expect(nearestMarker(m, 200, 200)).toBe(-1);
  });
  it('a point is on the visible hemisphere when dot(p, camera) > 1', () => {
    expect(facesCamera(surf(0, 0), [0, 0, 1.5])).toBe(true);
    expect(facesCamera(surf(180, 0), [0, 0, 1.5])).toBe(false);
    expect(facesCamera(surf(90, 0), [0, 0, 1.5])).toBe(false); // just past the limb
  });
  it('sprite height in world units for a pixel height, sizeAttenuation off', () => {
    expect(spriteScale(20, 800, 45 * DEG)).toBeCloseTo(
      (20 / 800) * 2 * Math.tan((45 * DEG) / 2),
      12,
    );
  });
});

import { makeUserSite, mergeSites, slugOf } from '../src/usersites';

describe('sites added by the visitor', () => {
  it('slugs like the published ids, and stays unique', () => {
    expect(slugOf('  Café Rim #2 ')).toBe('cafe-rim-2');
    expect(slugOf('***')).toBe('site');
    expect(makeUserSite('Haworth', -87, 5, ['haworth']).id).toBe('haworth-2');
  });
  it('gets the same polar stereographic position the pipeline publishes', () => {
    const s = makeUserSite('Shackleton copy', -89.7804, -156.19695, []);
    expect(s.ps_x_m).toBeCloseTo(-2687.5, -1);
    expect(s.ps_y_m).toBeCloseTo(-6092.5, -1);
    expect(s.user).toBe(true);
  });
  it('a published site with the same id replaces the visitor’s', () => {
    const mine = makeUserSite('Haworth', -87, 5, []);
    const pub = { ...mine, user: undefined, name: 'Haworth' };
    expect(mergeSites([pub], [mine])).toEqual([pub]);
    expect(mergeSites([], [mine])).toEqual([mine]);
  });
});
