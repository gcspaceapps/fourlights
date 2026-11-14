"""Merge a site's horizons and ephemerides into the published JSON (the data contract).

    python -m four_lights.publish shackleton-rim

Writes web/public/data/sites/<id>.json and updates web/public/data/sites.json (other entries are
kept). Also writes the validation files: validation/photo-2026-11-14/<id>.json for every site,
and validation/connecting-ridge.json (2024-2026, horizons at 1 m and 5 m) for Connecting Ridge.
Angles rounded to 0.01°.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path

from four_lights.dsn import station_mask
from four_lights.ephem import PHOTO, PRODUCT, VALIDATION
from four_lights.manifest import log_run
from four_lights.paths import EPHEM_OUT, HORIZON_OUT, PUBLIC_DATA


def _r2(xs: list[float]) -> list[float]:
    return [round(v, 2) for v in xs]


def _site_file(hz: dict, ep: dict, rng_name: str, heights: list[float] | None = None) -> dict:
    block = ep[rng_name]
    horizons = [h for h in hz["horizons"] if heights is None or h["height_m"] in heights]
    return {
        "id": hz["id"],
        "site": hz["site"],
        "horizons": [
            {"height_m": h["height_m"], "step_deg": h["step_deg"], "elev_deg": h["elev_deg"]}
            for h in horizons
        ],
        "times": {"start_utc": block["start_utc"], "step_min": block["step_min"], "n": block["n"]},
        "sun": {"az": _r2(block["sun"]["az"]), "el": _r2(block["sun"]["el"])},
        "earth": {"az": _r2(block["earth"]["az"]), "el": _r2(block["earth"]["el"])},
        "meta": {
            "dem_rings": [
                {"source": r["source"], "res_m": r["res_m"], "max_km": r["max_km"]}
                for r in hz["meta"]["dem_rings"]
            ],
            "ephem": ep["meta"]["ephem"],
            "frame": "MOON_ME",
            "built_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }


def _ground_source(site_id: str, hz: dict) -> dict:
    """The DEM under the site; filled in (and saved) for horizon files made before it existed."""
    if "ground_source" not in hz:
        from four_lights.run_horizon import build_rings, ground_source
        from four_lights.sites import SITES

        rings, _ = build_rings(SITES[site_id])
        hz["ground_source"] = ground_source(rings, hz["ps_x_m"], hz["ps_y_m"])
        (HORIZON_OUT / f"{site_id}.json").write_text(json.dumps(hz, indent=1) + "\n")
    return hz["ground_source"]


def _summary(hz: dict) -> dict:
    finest = _ground_source(hz["id"], hz)["res_m"]
    return {
        "id": hz["id"],
        "name": hz["name"],
        "lat": hz["site"]["lat"],
        "lon_e": hz["site"]["lon_e"],
        "ps_x_m": hz["ps_x_m"],
        "ps_y_m": hz["ps_y_m"],
        "source": hz["source"],
        "point_rule": hz["point_rule"],
        "approx": finest > 5,
    }


def _write(path: Path, obj: object, pretty: bool = False) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, indent=2) if pretty else json.dumps(obj, separators=(",", ":"))
    path.write_text(text + "\n")
    return path


def publish(site_id: str, *, log: bool = True) -> list[Path]:
    t0 = time.monotonic()
    hz = json.loads((HORIZON_OUT / f"{site_id}.json").read_text())
    ep = json.loads((EPHEM_OUT / f"{site_id}.json").read_text())
    if hz["site"]["lat"] != ep["site"]["lat"] or hz["site"]["lon_e"] != ep["site"]["lon_e"]:
        raise SystemExit(f"{site_id}: horizon and ephemeris site points differ; rerun ephem")

    product = _site_file(hz, ep, PRODUCT.name)
    # Canberra Link: which DSN station sees the Moon each hour (same for every site).
    product["stations"] = [int(v) for v in station_mask(PRODUCT)]
    outs = [_write(PUBLIC_DATA / "sites" / f"{site_id}.json", product)]
    outs.append(
        _write(
            PUBLIC_DATA / "validation" / PHOTO.name / f"{site_id}.json",
            _site_file(hz, ep, PHOTO.name),
        )
    )
    if VALIDATION.name in ep:
        outs.append(
            _write(
                PUBLIC_DATA / "validation" / f"{site_id}.json",
                _site_file(hz, ep, VALIDATION.name, heights=[1.0, 5.0]),
            )
        )

    index_path = PUBLIC_DATA / "sites.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    index = [s for s in index if s["id"] != site_id]
    index.append(_summary(hz))
    # Real sites first (south to north), fixtures last.
    index.sort(key=lambda s: (s["id"].startswith("fake-"), s["lat"]))
    outs.append(_write(index_path, index, pretty=True))

    dt = time.monotonic() - t0
    for o in outs:
        print(f"  wrote {o} ({o.stat().st_size / 1e3:.0f} kB)")
    if log:
        log_run(
            f"python -m four_lights.publish {site_id}",
            [],
            outs,
            dt,
            note=f"derived horizons + ephem for {site_id}",
        )
    return outs


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site")
    p.add_argument("--no-log", action="store_true")
    a = p.parse_args(argv)
    publish(a.site, log=not a.no_log)


if __name__ == "__main__":
    main()
