"""Cross-check against GRASS r.horizon on the near-field 5 m tile only. Not a like-for-like test.

Differences we expect and don't force away:
- r.horizon casts one ray per direction (we take the maximum over the whole 0.5° sector), so it
  can miss narrow peaks and should read the same or LOWER than us.
- It corrects its directions for the projection (r.horizon manual: "the resulting cardinal
  directions represent true orientation"), so with `-c` its output is already TRUE azimuth,
  clockwise from north. We first assumed grid bearings; the 14 sectors above 0° lined up only
  without a grid-to-true shift, which confirms the manual.
- It has no observer height: the eye is on the DEM surface. We compare with our engine at 0 m.
- Its curvature correction (if any) is for its location's ellipsoid, not the 1737.4 km Moon.
- It never reports a horizon below 0°: negative horizons come back as 0. So only sectors where
  either side is above the horizontal are compared, and the count of those is itself a check.

    python -m four_lights.grass_check shackleton-rim
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from four_lights.horizon import SECTORS, STEP_DEG, Ring, compute_horizon
from four_lights.paths import HORIZON_OUT
from four_lights.run_horizon import build_rings
from four_lights.sites import SITES, site_point


def grass_horizon(tile: Path, x: float, y: float) -> np.ndarray:
    """r.horizon angles (degrees) at grid bearings 0, 0.5, ... 359.5 clockwise from grid north."""
    if not shutil.which("grass"):
        raise SystemExit("GRASS is not installed")
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "hz.json"
        script = Path(tmp) / "run.sh"
        script.write_text(
            "set -e\n"
            f"r.external input={tile} output=dem --quiet\n"
            "g.region raster=dem\n"
            f"r.horizon -d -c elevation=dem coordinates={x},{y} step={STEP_DEG} "
            f"format=json file={out} --quiet\n"
        )
        subprocess.run(
            ["grass", "--tmp-project", str(tile), "--exec", "bash", str(script)],
            check=True,
            capture_output=True,
            text=True,
        )
        data = json.loads(out.read_text())
    rec = data[0] if isinstance(data, list) else data
    out_deg = np.full(SECTORS, np.nan)
    for h in rec["horizons"]:
        out_deg[int(round(float(h["azimuth"]) / STEP_DEG)) % SECTORS] = float(h["angle"])
    return out_deg


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site", choices=sorted(SITES))
    a = p.parse_args(argv)
    spec = SITES[a.site]
    rings, tile = build_rings(spec)
    if tile is None:
        raise SystemExit(f"{spec.id} has no 5 m site tile")
    pt = site_point(spec, tile, [r.raster for r in rings])
    ours = compute_horizon(pt.x, pt.y, [Ring(tile)], (0.0,), cover=False).profile(0.0)
    grid = grass_horizon(tile.path, pt.x, pt.y)
    lon_e = float(np.degrees(np.arctan2(pt.x, pt.y)))
    theirs = grid  # true azimuth already; a ray at bearing i * 0.5° falls in our sector i
    d = ours - theirs
    ok = np.isfinite(d) & ((ours > 0) | (theirs > 0))
    if not ok.any():
        raise SystemExit("no sector is above 0° on the tile alone: nothing to compare")
    stats = {
        "site": spec.id,
        "tile": tile.name,
        "lon_e_deg": round(lon_e, 3),
        "sectors_above_0_ours": int((ours > 0).sum()),
        "sectors_above_0_grass": int((theirs > 0).sum()),
        "sectors_compared": int(ok.sum()),
        "median_diff_deg": round(float(np.median(d[ok])), 3),
        "mean_abs_diff_deg": round(float(np.mean(np.abs(d[ok]))), 3),
        "p95_abs_diff_deg": round(float(np.percentile(np.abs(d[ok]), 95)), 3),
        "ours_minus_grass_negative_sectors": int((d[ok] < -0.05).sum()),
        "max_ours_deg": round(float(ours.max()), 2),
        "max_grass_deg": round(float(np.nanmax(theirs)), 2),
        "argmax_ours_az": float(np.argmax(ours) * STEP_DEG),
        "argmax_grass_az": float(np.nanargmax(theirs) * STEP_DEG),
    }
    out = HORIZON_OUT / f"{spec.id}.grass.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(stats, indent=1) + "\n")
    for k, v in stats.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
