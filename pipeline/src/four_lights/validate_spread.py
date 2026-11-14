"""S7 follow-up: how much does Connecting Ridge's illumination change between nearby points?

    python -m four_lights.validate_spread [--step 20] [--n 1]

Barker et al. 2021 average over small regions and take the 1st percentile of 100 DEM clones; we
use one pixel. This recomputes the horizon at a (2n+1) x (2n+1) grid of points `step` metres apart
around our site point and reports the spread of average illumination and longest dark, 2024-2026,
at 1 m and 5 m. The Sun's direction is taken from the site point (the parallax over tens of
metres is far below 0.01°).
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from four_lights.horizon import compute_horizon
from four_lights.paths import DERIVED, HORIZON_OUT, PUBLIC_DATA
from four_lights.run_horizon import build_rings
from four_lights.sites import SITES
from four_lights.validate import stats_for

HEIGHTS = (1.0, 5.0)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--step", type=float, default=20.0)
    p.add_argument("--n", type=int, default=1)
    a = p.parse_args(argv)
    base = json.loads((PUBLIC_DATA / "validation" / "connecting-ridge.json").read_text())
    site = json.loads((HORIZON_OUT / "connecting-ridge.json").read_text())
    x0, y0 = site["ps_x_m"], site["ps_y_m"]
    rings, _ = build_rings(SITES["connecting-ridge"])
    rows = []
    for i in range(-a.n, a.n + 1):
        for j in range(-a.n, a.n + 1):
            x, y = x0 + i * a.step, y0 + j * a.step
            res = compute_horizon(x, y, rings, HEIGHTS)
            d = dict(base)
            d["horizons"] = [
                {"height_m": h, "step_deg": 0.5, "elev_deg": [float(v) for v in res.profile(h)]}
                for h in HEIGHTS
            ]
            row = {"dx_m": i * a.step, "dy_m": j * a.step, "ground_m": round(res.ground_m, 1)}
            for h in HEIGHTS:
                s = stats_for(d, h)["centre"]
                row[f"avg_pct_{h:g}m"] = round(s.avg_pct, 1)
                row[f"dark_d_{h:g}m"] = round(s.longest_dark_d, 1)
            rows.append(row)
            print(row, flush=True)
    out = {"step_m": a.step, "points": rows}
    for h in HEIGHTS:
        v = np.asarray([r[f"avg_pct_{h:g}m"] for r in rows])
        k = np.asarray([r[f"dark_d_{h:g}m"] for r in rows])
        out[f"{h:g}m"] = {
            "avg_pct_min": float(v.min()),
            "avg_pct_mean": round(float(v.mean()), 1),
            "avg_pct_max": float(v.max()),
            "dark_d_min": float(k.min()),
            "dark_d_max": float(k.max()),
        }
        print(
            f"{h:g} m over {len(rows)} points: illumination {v.min():.1f}-{v.max():.1f}% "
            f"(mean {v.mean():.1f}%), longest dark {k.min():.1f}-{k.max():.1f} d"
        )
    (DERIVED / "validation-spread.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
