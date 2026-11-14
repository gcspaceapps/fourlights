"""S7: Connecting Ridge, 2024-01-01 to 2026-01-01, against Barker et al. 2021 Table 2.

    python -m four_lights.validate

Reads web/public/data/validation/connecting-ridge.json (hourly, 1 m and 5 m). Reports average
illumination, longest sunlit and longest dark stretches two ways:
- "centre": the Sun's centre above the terrain (what the product uses);
- "disc": the visible fraction of a 0.2666°-radius solar disc above the terrain line (closer to
  Barker's method; "dark" = no part of the disc visible, "sunlit" = any part visible).
Barker's numbers are the 1st percentile over 100 DEM clones, averaged over small regions, so a
single point should sit at or above them: we say "consistent with" only where that holds.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from four_lights.paths import DERIVED, PUBLIC_DATA

SUN_RADIUS_DEG = 0.2666

# Barker et al. 2021, Table 2, Connecting Ridge (ranges over their region centroids).
BARKER = {
    1.0: {"avg_pct": (67, 71), "longest_lit_d": (63, 142), "longest_dark_d": (13, 22)},
    5.0: {"avg_pct": (83, 89), "longest_lit_d": None, "longest_dark_d": (4, 8)},
}


def visible_fraction(clear_deg: np.ndarray, r: float = SUN_RADIUS_DEG) -> np.ndarray:
    """Fraction of a disc of radius r whose centre is `clear_deg` above a straight horizon."""
    x = np.clip(clear_deg / r, -1.0, 1.0)
    return 1.0 - (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / np.pi


def longest_run(mask: np.ndarray) -> int:
    """Longest run of True, in samples."""
    best = run = 0
    for v in mask:
        run = run + 1 if v else 0
        best = max(best, run)
    return best


@dataclass
class Stats:
    avg_pct: float
    longest_lit_d: float
    longest_dark_d: float


def stats_for(d: dict, height_m: float) -> dict[str, Stats]:
    h = next(p for p in d["horizons"] if p["height_m"] == height_m)
    terrain = np.asarray(h["elev_deg"])
    az = np.asarray(d["sun"]["az"])
    el = np.asarray(d["sun"]["el"])
    clear = el - terrain[(np.floor((az % 360) / h["step_deg"]).astype(int)) % terrain.size]
    hours_per_day = 24 * 60 / d["times"]["step_min"]
    centre_lit = clear > 0
    frac = visible_fraction(clear)
    return {
        "centre": Stats(
            100 * centre_lit.mean(),
            longest_run(centre_lit) / hours_per_day,
            longest_run(~centre_lit) / hours_per_day,
        ),
        "disc": Stats(
            100 * frac.mean(),
            longest_run(frac > 0) / hours_per_day,
            longest_run(frac == 0) / hours_per_day,
        ),
    }


def _verdict(v: float, rng: tuple[float, float] | None, higher_is_ours: bool) -> str:
    if rng is None:
        return "n/a"
    lo, hi = rng
    if lo <= v <= hi:
        return "within"
    if (v > hi) == higher_is_ours:
        return "beyond (expected side)"
    return "OUTSIDE (wrong side)"


def main() -> None:
    d = json.loads((PUBLIC_DATA / "validation" / "connecting-ridge.json").read_text())
    rows = []
    out: dict[str, object] = {"period": f"{d['times']['start_utc']} + {d['times']['n']} h"}
    for hgt in (1.0, 5.0):
        s = stats_for(d, hgt)
        b = BARKER[hgt]
        out[f"{hgt:g} m"] = {k: vars(v) for k, v in s.items()}
        for method, st in s.items():
            rows.append(
                f"| {hgt:g} m | {method} | {st.avg_pct:.1f}% "
                f"({_verdict(st.avg_pct, b['avg_pct'], True)}) | {st.longest_lit_d:.1f} d "
                f"({_verdict(st.longest_lit_d, b['longest_lit_d'], True)}) | "
                f"{st.longest_dark_d:.1f} d "
                f"({_verdict(st.longest_dark_d, b['longest_dark_d'], False)}) |"
            )
    table = [
        "| Height | Sun as | Average illumination (Barker 1 m 67–71%, 5 m 83–89%) "
        "| Longest sunlit (Barker 1 m 63–142 d) | Longest dark (Barker 1 m 13–22 d, 5 m 4–8 d) |",
        "|---|---|---|---|---|",
        *rows,
    ]
    print("\n".join(table))
    out["table_md"] = "\n".join(table)
    DERIVED.mkdir(parents=True, exist_ok=True)
    (DERIVED / "validation-connecting-ridge.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
