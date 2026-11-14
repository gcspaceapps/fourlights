"""S6: Power-threshold sanity check and demo-scenario candidates, from the published site files.

    python -m four_lights.scenario [--slip 3] [--days 7]

Uses exactly the rules in web/src/lights.ts and web/src/planner.ts (2 m observer):
Sun on = Sun's centre above the terrain; Comms on = Earth's centre >= 1° above the terrain and
(Canberra Link) a DSN station sees the Moon;
Power = sunlit >= 70% of the window and no dark spell > 48 h; usable days = hours with Sun and
Comms on / 24, to one decimal; green = Power on and usable >= 50% of the window, amber = Power on,
red = Power off. Fixture (fake-*) sites are ignored.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta

import numpy as np

from four_lights.paths import PUBLIC_DATA

POWER_MIN_SUNLIT_FRACTION = 0.7
POWER_MAX_DARK_HOURS = 48
COMMS_MARGIN_DEG = 1.0
GREEN_MIN_USABLE_FRACTION = 0.5
HEIGHT_M = 2.0


def load_sites() -> dict[str, dict]:
    index = json.loads((PUBLIC_DATA / "sites.json").read_text())
    out = {}
    for s in index:
        if s["id"].startswith("fake-"):
            continue
        d = json.loads((PUBLIC_DATA / "sites" / f"{s['id']}.json").read_text())
        d["name"] = s["name"]
        out[s["id"]] = d
    return out


def hourly_flags(d: dict) -> tuple[np.ndarray, np.ndarray]:
    h = next(p for p in d["horizons"] if p["height_m"] == HEIGHT_M)
    terrain = np.asarray(h["elev_deg"])

    def under(az: list[float]) -> np.ndarray:
        a = np.asarray(az)
        return terrain[(np.floor((a % 360) / h["step_deg"]).astype(int)) % terrain.size]

    sun = np.asarray(d["sun"]["el"]) > under(d["sun"]["az"])
    comms = np.asarray(d["earth"]["el"]) - under(d["earth"]["az"]) >= COMMS_MARGIN_DEG
    if "stations" in d:  # Canberra Link: a DSN station must also see the Moon
        comms &= np.asarray(d["stations"]) > 0
    return sun, comms


def window(sun: np.ndarray, comms: np.ndarray, start: int, hours: int) -> tuple[float, int, float]:
    """(sunlit fraction, longest dark h, usable days) for one window."""
    s = sun[start : start + hours]
    lit = float(s.mean())
    longest = run = 0
    for v in s:
        run = 0 if v else run + 1
        longest = max(longest, run)
    usable = round(float((s & comms[start : start + hours]).sum()) / 24, 1)
    return lit, longest, usable


def verdict(lit: float, dark: int, usable: float, days: int) -> str:
    if not (lit >= POWER_MIN_SUNLIT_FRACTION and dark <= POWER_MAX_DARK_HOURS):
        return "red"
    return "green" if usable >= GREEN_MIN_USABLE_FRACTION * days else "amber"


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--slip", type=int, default=3)
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--top", type=int, default=8)
    a = p.parse_args(argv)
    sites = load_sites()
    flags = {k: hourly_flags(d) for k, d in sites.items()}
    any_site = next(iter(sites.values()))
    t0 = datetime.fromisoformat(any_site["times"]["start_utc"].replace("Z", "+00:00"))
    n = any_site["times"]["n"]
    hours = a.days * 24
    n_days = (n - hours) // 24 - a.slip

    # 1. Threshold sanity: distribution over every site x daily window start.
    lits, darks = [], []
    table: dict[str, list[tuple[float, int, float]]] = {}
    for k, (sun, comms) in flags.items():
        table[k] = [window(sun, comms, d * 24, hours) for d in range(n_days + a.slip)]
        lits += [w[0] for w in table[k]]
        darks += [w[1] for w in table[k]]
    lits_a, darks_a = np.asarray(lits), np.asarray(darks)
    print(f"{len(lits)} site-windows ({a.days} d), 2 m observer:")
    print(
        "  sunlit fraction percentiles 10/25/50/75/90: "
        + " / ".join(f"{np.percentile(lits_a, q) * 100:.0f}%" for q in (10, 25, 50, 75, 90))
    )
    print(
        "  longest dark (h) percentiles 10/25/50/75/90: "
        + " / ".join(f"{np.percentile(darks_a, q):.0f}" for q in (10, 25, 50, 75, 90))
    )
    power = (lits_a >= POWER_MIN_SUNLIT_FRACTION) & (darks_a <= POWER_MAX_DARK_HOURS)
    print(
        f"  Power on in {power.mean() * 100:.0f}% of site-windows "
        f"(sunlit test alone {np.mean(lits_a >= POWER_MIN_SUNLIT_FRACTION) * 100:.0f}%, "
        f"dark test alone {np.mean(darks_a <= POWER_MAX_DARK_HOURS) * 100:.0f}%)"
    )
    print("  per site, % of windows with Power on:")
    for k in sites:
        w = np.asarray([verdict(*x, a.days) != "red" for x in table[k]])
        print(f"    {sites[k]['name']:22} {w.mean() * 100:5.1f}%")

    # 2. Demo candidates: planned day d vs slipped day d + slip.
    cands = []
    for d in range(n_days):
        before = {k: verdict(*table[k][d], a.days) for k in sites}
        after = {k: verdict(*table[k][d + a.slip], a.days) for k in sites}
        lost = [k for k in sites if before[k] == "green" and after[k] == "red"]
        kept = [k for k in sites if before[k] == "green" and after[k] == "green"]
        if lost and len(kept) == 1:
            score = len(lost) * 10 - sum(after[k] == "green" for k in sites if k not in kept)
            cands.append((score, d, lost, kept[0], before, after))
    cands.sort(key=lambda c: (-c[0], c[1]))
    print(
        f"\n{len(cands)} candidate planned dates where a {a.slip}-day slip turns green sites red "
        f"and exactly one site stays green:"
    )
    for _score, d, lost, kept, _before, after in cands[: a.top]:
        day = (t0 + timedelta(days=d)).date()
        others = [k for k in sites if after[k] == "green" and k != kept]
        print(
            f"  {day}: {len(lost)} go green->red ({', '.join(sites[k]['name'] for k in lost)}); "
            f"stays green: {sites[kept]['name']}"
            + (
                f"; newly green after slip: {', '.join(sites[k]['name'] for k in others)}"
                if others
                else ""
            )
        )


if __name__ == "__main__":
    main()
