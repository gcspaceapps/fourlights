"""Pull Sun and Earth az/el for one site and write data/derived/ephem/<id>.json.

    python -m four_lights.run_ephem shackleton-rim

Reads the site point from data/derived/horizons/<id>.json (run `make horizon` first). Product range
and the Moon-photo window for every site; the validation range for Connecting Ridge. Horizons
first; if it fails, SPICE. SPICE is also run on the product range of every site as a check, and
Earth's mean azimuth is checked against the site's longitude (catches a flipped north).
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np

from four_lights.ephem import (
    PHOTO,
    PRODUCT,
    VALIDATION,
    Site,
    TimeRange,
    Track,
    compare,
    expected_earth_azimuth_deg,
    horizons,
    mean_azimuth_deg,
    spice,
)
from four_lights.manifest import log_run
from four_lights.paths import EPHEM_OUT, HORIZON_OUT
from four_lights.sources import SPICE_FILES

VALIDATION_SITE = "connecting-ridge"
EARTH_AZ_TOLERANCE_DEG = 10.0
SPICE_TOLERANCE_DEG = 0.05
"""Horizons (DE441, MEAN_ME) and SPICE (DE440s, ME_DE421) must agree this well, az and el."""


def load_site(site_id: str) -> Site:
    p = HORIZON_OUT / f"{site_id}.json"
    if not p.exists():
        raise SystemExit(f"{p} missing: run `make horizon SITE={site_id}` first")
    s = json.loads(p.read_text())["site"]
    return Site(site_id, s["lat"], s["lon_e"], s["elev_m"])


def _round(t: Track) -> dict[str, list[float]]:
    return {"az": [round(float(v), 4) for v in t.az], "el": [round(float(v), 4) for v in t.el]}


def get(body: str, site: Site, rng: TimeRange) -> tuple[Track, str]:
    try:
        return horizons(body, site, rng), "Horizons DE441"
    except (OSError, ValueError) as e:
        print(f"  Horizons failed for {body} {rng.name} ({e}); using SPICE", flush=True)
        return spice(body, site, rng), "SPICE DE440s"


def run(site_id: str, *, log: bool = True) -> None:
    t0 = time.monotonic()
    site = load_site(site_id)
    print(f"{site_id}: {site.lat:.4f}°, {site.lon_e:.4f}°E, {site.elev_m:.0f} m", flush=True)
    ranges = [PRODUCT, PHOTO] + ([VALIDATION] if site_id == VALIDATION_SITE else [])
    out: dict[str, object] = {
        "id": site_id,
        "site": {"lat": site.lat, "lon_e": site.lon_e, "elev_m": site.elev_m},
    }
    sources = set()
    checks: dict[str, object] = {}
    for rng in ranges:
        block: dict[str, object] = {
            "start_utc": rng.start_utc,
            "step_min": rng.step_min,
            "n": rng.n,
        }
        for body in ("sun", "earth"):
            track, src = get(body, site, rng)
            sources.add(src)
            block[body] = _round(track)
            if rng is PRODUCT:
                stats = compare(track, spice(body, site, rng))
                checks[f"horizons_vs_spice_{body}"] = {
                    k: float(f"{v:.2e}") for k, v in stats.items()
                }
                print(
                    f"  {body}: Horizons vs SPICE max |d az| {stats['max_abs_az_deg']:.1e}°, "
                    f"max |d el| {stats['max_abs_el_deg']:.1e}°",
                    flush=True,
                )
                if (
                    src.startswith("Horizons")
                    and max(stats["max_abs_az_deg"], stats["max_abs_el_deg"]) > SPICE_TOLERANCE_DEG
                ):
                    raise SystemExit(f"{site_id} {body}: Horizons and SPICE disagree: {stats}")
        out[rng.name] = block

    product = out[PRODUCT.name]
    assert isinstance(product, dict)
    earth_az = mean_azimuth_deg(np.asarray(product["earth"]["az"]))
    expect = expected_earth_azimuth_deg(site.lon_e)
    off = (earth_az - expect + 180) % 360 - 180
    checks["earth_mean_az_deg"] = round(earth_az, 2)
    checks["earth_expected_az_deg"] = round(expect, 2)
    print(f"  Earth mean azimuth {earth_az:.1f}° (expected ~{expect:.1f}° from the longitude)")
    if abs(off) > EARTH_AZ_TOLERANCE_DEG:
        raise SystemExit(
            f"{site_id}: Earth azimuth {earth_az:.1f}° is {off:.1f}° off: north flipped?"
        )

    out["meta"] = {
        "ephem": " + ".join(sorted(sources)),
        "frame": "MOON_ME",
        "checks": checks,
    }
    EPHEM_OUT.mkdir(parents=True, exist_ok=True)
    path = EPHEM_OUT / f"{site_id}.json"
    path.write_text(json.dumps(out) + "\n")
    dt = time.monotonic() - t0
    print(f"  wrote {path} in {dt:.0f} s")
    if log:
        log_run(
            f"python -m four_lights.run_ephem {site_id}",
            list(SPICE_FILES.values()),
            [path],
            dt,
            note="Horizons API (DE441), SPICE check",
        )


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site")
    p.add_argument("--no-log", action="store_true")
    a = p.parse_args(argv)
    run(a.site, log=not a.no_log)


if __name__ == "__main__":
    main()
