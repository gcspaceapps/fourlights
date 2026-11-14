"""The QGIS pack's planner layers: the app's published numbers as map layers.

    python -m four_lights.qgis_pack <out_dir>

Reads (and never changes):
    web/public/data/planner.json     the Slip Planner's numbers, per site and landing day
    data/derived/horizons/<id>.json  each site's terrain skyline
    data/derived/ephem/<id>.json     Sun and Earth directions from each site

Writes FlatGeobuf files in IAU_2015:30135 (Moon south polar stereographic):
    sites.fgb          the 12 sites with the demo scenario (planned landing and 3-day slip)
    planner_daily.fgb  one point per site and landing day, for the QGIS time slider
    skyline.fgb        each site's 360 degree skyline drawn around it, and a level-horizon circle
    earth_lines.fgb    a line from each site towards the Earth's mean direction

Nothing is worked out again here: the verdicts and usable days are the app's own. Plain Python
plus GDAL's ogr2ogr; QGIS is not needed for this step (qgis_project.py builds the project).
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from four_lights.paths import EPHEM_OUT, HORIZON_OUT, PUBLIC_DATA

CRS = "IAU_2015:30135"
WINDOW_DAYS = "7"
# The demo scenario (_shared/concept.md); DEFAULT_PLAN in web/src/main.ts is the same day.
# qgis_project.py takes its dates from here, so the layers and the project cannot disagree.
PLANNED = date(2028, 4, 19)
SLIP_DAYS = 3
SLIPPED = PLANNED + timedelta(days=SLIP_DAYS)
WORDS = {"g": "works", "a": "marginal", "r": "no power"}

# Skyline drawing: a level horizon sits on a circle of ROSE_BASE_M around the site, and each
# degree of terrain above (below) it pushes the line out (in) by ROSE_M_PER_DEG.
ROSE_BASE_M = 1500.0
ROSE_M_PER_DEG = 150.0
ROSE_MIN_M = 150.0
EARTH_LINE_M = 4000.0


def direction(x: float, y: float, az_deg: float) -> tuple[float, float]:
    """Map direction (unit vector) of a true-north azimuth at a point, south polar stereographic.

    The pole is the origin, so north is straight away from it; east is a quarter turn from that.
    """
    lon = math.atan2(x, y)
    north = (math.sin(lon), math.cos(lon))
    east = (math.cos(lon), -math.sin(lon))
    a = math.radians(az_deg)
    return (
        math.cos(a) * north[0] + math.sin(a) * east[0],
        math.cos(a) * north[1] + math.sin(a) * east[1],
    )


def feature(geom_type: str, coords: object, props: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": geom_type, "coordinates": coords},
        "properties": props,
    }


def write(dist: Path, name: str, features: list[dict]) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".geojson", delete=False) as tmp:
        json.dump({"type": "FeatureCollection", "features": features}, tmp)
    out = dist / f"{name}.fgb"
    try:
        subprocess.run(
            ["ogr2ogr", "-q", "-f", "FlatGeobuf", "-a_srs", CRS, "-nln", name, str(out), tmp.name],
            check=True,
        )
    finally:
        Path(tmp.name).unlink()
    print(f"  {out.name}: {len(features)} features")


def layers(
    planner_file: Path = PUBLIC_DATA / "planner.json",
    horizons: Path = HORIZON_OUT,
    ephem: Path = EPHEM_OUT,
) -> dict[str, list[dict]]:
    """The four layers as GeoJSON features, keyed by layer name."""
    planner = json.loads(planner_file.read_text())
    start = datetime.fromisoformat(planner["start_utc"].replace("Z", "+00:00")).date()
    window = planner["windows"][WINDOW_DAYS]
    i_plan = (PLANNED - start).days
    i_slip = i_plan + SLIP_DAYS

    sites, daily, skyline, earth = [], [], [], []
    for path in sorted(horizons.glob("*.json")):
        if path.name.count(".") > 1:  # *.bruteforce.json and *.grass.json are checks
            continue
        h = json.loads(path.read_text())
        sid, name, x, y = h["id"], h["name"], h["ps_x_m"], h["ps_y_m"]
        w = window[sid]

        def at(i: int, w: dict = w) -> dict:
            return {
                "usable": w["u"][i] / 10,
                "sun_pct": w["s"][i],
                "dark_h": w["d"][i],
                "verdict": WORDS[w["v"][i]],
            }

        plan, slip = at(i_plan), at(i_slip)
        sites.append(
            feature(
                "Point",
                [x, y],
                {
                    "id": sid,
                    "name": name,
                    "lat": h["site"]["lat"],
                    "lon_e": h["site"]["lon_e"],
                    "ground_m": h["site"]["elev_m"],
                    "source": h["source"],
                    "point_rule": h["point_rule"],
                    "plan_date": PLANNED.isoformat(),
                    **{f"plan_{k}": v for k, v in plan.items()},
                    "slip_date": SLIPPED.isoformat(),
                    **{f"slip_{k}": v for k, v in slip.items()},
                    "change": f"{plan['verdict']} -> {slip['verdict']}",
                },
            )
        )

        for i in range(len(w["u"])):
            landing = start + timedelta(days=i)
            daily.append(
                feature(
                    "Point",
                    [x, y],
                    {"id": sid, "name": name, "landing": landing.isoformat(), **at(i)},
                )
            )

        # The skyline the planner uses (observer height from planner.json), else the first one.
        profiles = h["horizons"]
        prof = next((p for p in profiles if p["height_m"] == planner["height_m"]), profiles[0])
        step, elev = prof["step_deg"], prof["elev_deg"]
        ring, level = [], []
        for k, e in enumerate(elev):
            dx, dy = direction(x, y, k * step)
            r = max(ROSE_MIN_M, ROSE_BASE_M + ROSE_M_PER_DEG * e)
            ring.append([round(x + r * dx, 1), round(y + r * dy, 1)])
            level.append([round(x + ROSE_BASE_M * dx, 1), round(y + ROSE_BASE_M * dy, 1)])
        common = {"id": sid, "name": name, "height_m": prof["height_m"]}
        skyline.append(
            feature(
                "Polygon",
                [[*ring, ring[0]]],
                {**common, "kind": "skyline", "max_deg": max(elev), "min_deg": min(elev)},
            )
        )
        skyline.append(
            feature("Polygon", [[*level, level[0]]], {**common, "kind": "level horizon (0 deg)"})
        )

        e = json.loads((ephem / path.name).read_text())
        az = e["meta"]["checks"]["earth_mean_az_deg"]
        el = e["product"]["earth"]["el"]
        dx, dy = direction(x, y, az)
        earth.append(
            feature(
                "LineString",
                [[x, y], [round(x + EARTH_LINE_M * dx, 1), round(y + EARTH_LINE_M * dy, 1)]],
                {
                    "id": sid,
                    "name": name,
                    "mean_az_deg": az,
                    "el_min_deg": round(min(el), 2),
                    "el_max_deg": round(max(el), 2),
                },
            )
        )

    return {"sites": sites, "planner_daily": daily, "skyline": skyline, "earth_lines": earth}


def build(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, features in layers().items():
        write(out, name, features)


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve())
