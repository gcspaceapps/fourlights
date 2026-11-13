"""Independent check of the horizon engine: every pixel, eight sectors, different maths.

The engine uses an analytic stereographic inverse, Cartesian vectors and an east-north-up frame.
This check uses pyproj for the inverse, the spherical forward-azimuth formula for bearing and the
law of cosines for elevation. Each DEM ring runs on its own over every pixel within its max_km
(no ring hand-off), and is compared with the engine run the same way (`cover=False`) with
near-pixel spreading off (`spread=False`), since the brute force bins pixel centres only.
It then reports how much spreading changes the real product profile.

    python -m four_lights.bruteforce shackleton-rim
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np
from pyproj import Transformer

from four_lights import MOON_RADIUS_M
from four_lights.dem import SOUTH_POLAR_STEREO
from four_lights.horizon import (
    NO_TERRAIN_DEG,
    SECTORS,
    STEP_DEG,
    Ring,
    compute_horizon,
    site_ground,
)
from four_lights.paths import HORIZON_OUT
from four_lights.run_horizon import build_rings
from four_lights.sites import SITES, site_point

CHECK_SECTORS = [37 + 90 * k for k in range(8)]
"""Eight sectors spread round the sky, starting 18.5°, 63.5°, ... 333.5°."""
TOLERANCE_DEG = 0.01


def brute_sector_max(
    ring: Ring,
    x: float,
    y: float,
    ground: float,
    height_m: float,
    sectors: list[int],
    strip_px: int = 2_000_000,
) -> np.ndarray:
    """Highest elevation in each of `sectors` over every pixel of one ring."""
    r = ring.raster
    to_geo = Transformer.from_crs(
        SOUTH_POLAR_STEREO, SOUTH_POLAR_STEREO.geodetic_crs, always_xy=True
    )
    lon0_deg, lat0_deg = to_geo.transform(x, y)
    lat0, lon0 = np.radians(lat0_deg), np.radians(lon0_deg)
    r_obs = MOON_RADIUS_M + ground + height_m
    best = np.full(len(sectors), NO_TERRAIN_DEG)
    want = np.full(SECTORS, -1)
    want[sectors] = np.arange(len(sectors))
    lim = np.inf if ring.max_km is None else ring.max_km * 1000.0
    c0 = max(0, int((x - lim - r.left) // r.res_m)) if np.isfinite(lim) else 0
    c1 = min(r.width, int((x + lim - r.left) // r.res_m) + 1) if np.isfinite(lim) else r.width
    r0 = max(0, int((r.top - y - lim) // r.res_m)) if np.isfinite(lim) else 0
    r1 = min(r.height, int((r.top - y + lim) // r.res_m) + 1) if np.isfinite(lim) else r.height
    if c0 >= c1 or r0 >= r1:
        return best
    xs = r.left + (np.arange(c0, c1) + 0.5) * r.res_m
    step = max(1, strip_px // (c1 - c0))
    for a in range(r0, r1, step):
        b = min(r1, a + step)
        h = r.read(a, b, c0, c1)
        ys = r.top - (np.arange(a, b) + 0.5) * r.res_m
        gx, gy = np.meshgrid(xs, ys)
        d2 = (gx - x) ** 2 + (gy - y) ** 2
        m = np.isfinite(h) & (d2 >= r.res_m**2) & (d2 < lim**2)
        if not m.any():
            continue
        lon_d, lat_d = to_geo.transform(gx[m], gy[m])
        lat, lon = np.radians(lat_d), np.radians(lon_d)
        dlon = lon - lon0
        bearing = (
            np.degrees(
                np.arctan2(
                    np.sin(dlon) * np.cos(lat),
                    np.cos(lat0) * np.sin(lat) - np.sin(lat0) * np.cos(lat) * np.cos(dlon),
                )
            )
            % 360.0
        )
        k = want[(bearing / STEP_DEG).astype(np.int64) % SECTORS]
        sel = k >= 0
        if not sel.any():
            continue
        cosg = np.sin(lat0) * np.sin(lat[sel]) + np.cos(lat0) * np.cos(lat[sel]) * np.cos(dlon[sel])
        gamma = np.arccos(np.clip(cosg, -1.0, 1.0))
        r_pt = MOON_RADIUS_M + h[m][sel]
        el = np.degrees(np.arctan2(r_pt * np.cos(gamma) - r_obs, r_pt * np.sin(gamma)))
        np.maximum.at(best, k[sel], el)
    return best


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site", choices=sorted(SITES))
    p.add_argument("--height", type=float, default=2.0)
    a = p.parse_args(argv)
    spec = SITES[a.site]
    rings, tile = build_rings(spec)
    pt = site_point(spec, tile)
    ground, _ = site_ground(rings, pt.x, pt.y)
    report = []
    worst = 0.0
    for ring in rings:
        t0 = time.monotonic()
        brute = brute_sector_max(ring, pt.x, pt.y, ground, a.height, CHECK_SECTORS)
        seen = brute > NO_TERRAIN_DEG
        if not seen.any():
            print(f"{ring.raster.name}: no pixels in the check sectors")
            continue
        eng = compute_horizon(
            pt.x,
            pt.y,
            [ring],
            (a.height,),
            cover=False,
            ground_m=ground,
            allow_gaps=True,
            spread=False,
            near=False,
        ).profile(a.height)[CHECK_SECTORS]
        diff = float(np.abs(eng[seen] - brute[seen]).max())
        worst = max(worst, diff)
        print(
            f"{ring.raster.name}: max |engine - brute| {diff:.4f}° over {int(seen.sum())} "
            f"sectors ({time.monotonic() - t0:.0f} s)",
            flush=True,
        )
        report.append(
            {
                "ring": ring.raster.name,
                "max_abs_diff_deg": round(diff, 4),
                "brute_deg": [round(float(v), 4) for v in brute],
                "engine_deg": [round(float(v), 4) for v in eng],
            }
        )

    # How the near-field model moves the real product profile (all rings, hand-off on):
    # product (bilinear resampling near the site) vs flat-topped pixel blocks vs centres only.
    def run(**kw: bool) -> np.ndarray:
        return compute_horizon(pt.x, pt.y, rings, (a.height,), **kw).profile(a.height)

    product = run()
    blocks = run(near=False)
    centres = run(near=False, spread=False)
    spread_effect = {}
    for name, other in (("vs_blocks", blocks), ("vs_centres", centres)):
        d = product - other
        spread_effect[name] = {
            "max_abs_deg": round(float(np.abs(d).max()), 3),
            "sectors_over_0_05_deg": int((np.abs(d) > 0.05).sum()),
        }
        print(
            f"near-field model, product {name}: max |d| {np.abs(d).max():.3f}°, "
            f"{int((np.abs(d) > 0.05).sum())} sectors differ by > 0.05°"
        )
    out = HORIZON_OUT / f"{spec.id}.bruteforce.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "site": spec.id,
                "height_m": a.height,
                "sectors": CHECK_SECTORS,
                "tolerance_deg": TOLERANCE_DEG,
                "worst_abs_diff_deg": round(worst, 4),
                "rings": report,
                "spread_effect": spread_effect,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"worst |engine - brute| = {worst:.4f}° (tolerance {TOLERANCE_DEG}°); wrote {out}")
    if worst > TOLERANCE_DEG:
        raise SystemExit("brute-force check FAILED")


if __name__ == "__main__":
    main()
