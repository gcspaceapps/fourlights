"""Compute one site's horizon profiles and write data/derived/horizons/<id>.json plus a plot.

python -m four_lights.run_horizon shackleton-rim
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from four_lights.dem import FileRaster
from four_lights.dem import bounds as tile_bounds
from four_lights.horizon import (
    OBSERVER_HEIGHTS_M,
    STEP_DEG,
    HorizonResult,
    Ring,
    compute_horizon,
    ring_overlap_check,
    site_ground,
)
from four_lights.manifest import log_run
from four_lights.paths import HORIZON_OUT, MEDIA, RAW_LOLA
from four_lights.sites import SITES, SitePoint, SiteSpec, site_point
from four_lights.sources import FILES, MOSAIC_87S, MOSAIC_87S_KM, POLAR_RINGS, site_tile

SITE07_POINTS = "lola-5mpp-sites/Site07_final_adj.xyzi"

OVERLAP_MAX_MEDIAN_M = 5.0
"""Rings must agree: |median(fine - coarse)| below this where they overlap near the site."""
OVERLAP_MAX_MEDIAN_ABS_M = 15.0


def check_tile_against_point_cloud(tile: FileRaster, xyzi: Path) -> None:
    """Site07: the tile's georeferencing must match its LOLA point cloud (PS km, doubles x4)."""
    pts = np.fromfile(xyzi, dtype="<f8").reshape(-1, 4)[:, :2] * 1000.0
    left, bottom, right, top = tile_bounds(tile)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    if max(abs(lo[0] - left), abs(hi[0] - right), abs(lo[1] - bottom), abs(hi[1] - top)) > 10.0:
        raise SystemExit(
            f"{tile.name}: tile bounds {left, bottom, right, top} do not match the "
            f"point cloud {lo.tolist()}..{hi.tolist()}"
        )


def build_rings(spec: SiteSpec) -> tuple[list[Ring], FileRaster | None]:
    rings: list[Ring] = []
    tile = None
    if spec.pgda_site:
        tile = FileRaster(RAW_LOLA / site_tile(spec.pgda_site), f"PGDA {spec.pgda_site} 5 m")
        if spec.pgda_site == "Site07":
            check_tile_against_point_cloud(tile, RAW_LOLA / SITE07_POINTS)
        rings.append(Ring(tile, None))
    rings.append(Ring(FileRaster(RAW_LOLA / MOSAIC_87S, "LDEM_87S_5MPP"), MOSAIC_87S_KM))
    for lbl, km, name in POLAR_RINGS:
        rings.append(Ring(FileRaster(RAW_LOLA / lbl, name), km))
    return rings, tile


def check_overlaps(res: HorizonResult, rings: list[Ring]) -> list[dict[str, object]]:
    """Each used ring against the next coarser used ring, near the site. Raises on disagreement."""
    used = [r for r, u in zip(rings, res.rings, strict=True) if u.pixels > 0]
    out: list[dict[str, object]] = []
    for fine, coarse in zip(used, used[1:], strict=False):
        radius = 1000.0 * (fine.max_km or 10.0)
        stats = ring_overlap_check(fine.raster, coarse.raster, res.site_x, res.site_y, radius)
        if stats is None:
            continue
        row: dict[str, object] = {"fine": fine.raster.name, "coarse": coarse.raster.name, **stats}
        out.append(row)
        print(
            f"  overlap {fine.raster.name} vs {coarse.raster.name}: median "
            f"{stats['median_m']:+.2f} m, median |d| {stats['median_abs_m']:.2f} m, "
            f"p95 |d| {stats['p95_abs_m']:.1f} m (n={stats['n']:.0f})"
        )
        if (
            abs(stats["median_m"]) > OVERLAP_MAX_MEDIAN_M
            or stats["median_abs_m"] > OVERLAP_MAX_MEDIAN_ABS_M
        ):
            raise SystemExit(f"DEMs disagree: {row}")
    return out


def ground_source(rings: list[Ring], x: float, y: float) -> dict[str, object]:
    """The DEM the site's own ground (and near field) comes from: decides `approx`."""
    _, name = site_ground(rings, x, y)
    r = next(r.raster for r in rings if r.raster.name == name)
    return {"source": name, "res_m": r.res_m}


def to_json(spec: SiteSpec, pt: SitePoint, res: HorizonResult, overlaps: list) -> dict:
    return {
        "id": spec.id,
        "name": spec.name,
        "source": spec.source,
        "point_rule": pt.rule,
        "ps_x_m": round(pt.x, 1),
        "ps_y_m": round(pt.y, 1),
        "site": {
            "lat": round(res.lat_deg, 5),
            "lon_e": round(res.lon_e_deg, 5),
            "elev_m": round(res.ground_m, 1),
        },
        "horizons": [
            {
                "height_m": h,
                "step_deg": STEP_DEG,
                "elev_deg": [round(float(v), 2) for v in res.profile(h)],
            }
            for h in res.heights_m
        ],
        "meta": {
            "dem_rings": [
                {"source": u.source, "res_m": u.res_m, "max_km": round(u.max_dist_m / 1000, 1)}
                for u in res.rings
                if u.pixels > 0
            ],
            "ring_pixels": {u.source: u.pixels for u in res.rings if u.pixels > 0},
            "ring_overlaps": overlaps,
            "frame": "MOON_ME",
            "built_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }


def plot(spec: SiteSpec, res: HorizonResult, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    az = np.arange(res.elev_deg.shape[1]) * STEP_DEG + STEP_DEG / 2
    fig, ax = plt.subplots(figsize=(14, 3.6), dpi=120)
    ax.fill_between(
        az,
        -90,
        res.profile(2.0),
        step="mid",
        color="#8a8a8a",
        alpha=0.6,
        label="terrain, 2 m observer",
    )
    for h, c in zip(res.heights_m, ["#d62728", "#222222", "#1f77b4"], strict=False):
        ax.step(az, res.profile(h), where="mid", lw=0.8, color=c, label=f"{h:g} m")
    lo, hi = float(res.elev_deg.min()), float(res.elev_deg.max())
    ax.set_ylim(lo - 0.5, max(hi, 2.0) + 0.5)
    ax.set_xlim(0, 360)
    ax.set_xticks(range(0, 361, 45), ["N", "45", "E", "135", "S", "225", "W", "315", "N"])
    ax.axhline(0, color="k", lw=0.4)
    ax.set_xlabel("azimuth from true north (°)")
    ax.set_ylabel("elevation (°)")
    ax.set_title(
        f"{spec.name}: terrain horizon ({res.lat_deg:.3f}°, {res.lon_e_deg:.3f}°E, "
        f"ground {res.ground_m:.0f} m). LOLA DEMs; true north is away from the pole."
    )
    ax.legend(loc="upper right", fontsize=8, ncol=4)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)


def run(site_id: str, *, write_plot: bool = True, log: bool = True) -> Path:
    spec = SITES[site_id]
    t0 = time.monotonic()
    rings, tile = build_rings(spec)
    pt = site_point(spec, tile, [r.raster for r in rings])
    print(f"{spec.id}: site point ({pt.x:.1f}, {pt.y:.1f}) m; {pt.rule}", flush=True)
    res = compute_horizon(pt.x, pt.y, rings, OBSERVER_HEIGHTS_M, progress=True)
    overlaps = check_overlaps(res, rings)
    out = HORIZON_OUT / f"{spec.id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = to_json(spec, pt, res, overlaps)
    doc["ground_source"] = ground_source(rings, pt.x, pt.y)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    outputs = [out]
    if write_plot:
        png = MEDIA / f"skyline-{spec.id}.png"
        plot(spec, res, png)
        outputs.append(png)
    dt = time.monotonic() - t0
    for h in res.heights_m:
        p = res.profile(h)
        print(
            f"  {h:g} m: horizon {p.min():+.2f}° to {p.max():+.2f}° "
            f"(max at {np.argmax(p) * STEP_DEG:.1f}°)"
        )
    print(f"  wrote {', '.join(str(o) for o in outputs)} in {dt:.0f} s")
    if log:
        inputs = [
            FILES[r.raster.path.relative_to(RAW_LOLA).as_posix().replace(".LBL", ".IMG")]
            for r, u in zip(rings, res.rings, strict=True)
            if u.pixels > 0 and isinstance(r.raster, FileRaster)
        ]
        log_run(f"python -m four_lights.run_horizon {site_id}", inputs, outputs, dt)
    return out


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site", choices=sorted(SITES))
    p.add_argument("--no-plot", action="store_true")
    p.add_argument("--no-log", action="store_true")
    a = p.parse_args(argv)
    run(a.site, write_plot=not a.no_plot, log=not a.no_log)


if __name__ == "__main__":
    main()
