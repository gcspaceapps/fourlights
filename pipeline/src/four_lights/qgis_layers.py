"""QGIS check layers: site points, their tile/region centres and DEM ring circles.

    python -m four_lights.qgis_layers      ->  data/derived/qgis/four-lights-check.gpkg

All layers in IAU_2015:30135 (Moon south polar stereographic). Open the GeoPackage in QGIS over
the LOLA GeoTIFFs in data/raw/lola/ (set the project CRS by code, IAU_2015:30135) and check that
each site point sits on a high spot and each ring circle matches the DEM it names.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

from four_lights.paths import DERIVED, HORIZON_OUT

OUT = DERIVED / "qgis" / "four-lights-check.gpkg"
CRS = "IAU_2015:30135"


def _circle(x: float, y: float, r: float, n: int = 180) -> list[list[float]]:
    pts = [
        [x + r * math.cos(2 * math.pi * k / n), y + r * math.sin(2 * math.pi * k / n)]
        for k in range(n)
    ]
    return [*pts, pts[0]]


def _feature(geom: dict, props: dict) -> dict:
    return {"type": "Feature", "geometry": geom, "properties": props}


def build() -> Path:
    points, centres, rings = [], [], []
    for p in sorted(HORIZON_OUT.glob("*.json")):
        if p.name.count(".") > 1:  # skip *.bruteforce.json, *.grass.json
            continue
        d = json.loads(p.read_text())
        x, y = d["ps_x_m"], d["ps_y_m"]
        props = {
            "id": d["id"],
            "name": d["name"],
            "rule": d["point_rule"],
            "ground_m": d["site"]["elev_m"],
        }
        points.append(_feature({"type": "Point", "coordinates": [x, y]}, props))
        m = [float(v) for v in re.findall(r"\((-?[\d.]+), (-?[\d.]+)\) km", d["point_rule"])[-1]]
        centres.append(
            _feature(
                {"type": "Point", "coordinates": [m[0] * 1000, m[1] * 1000]},
                {"id": d["id"], "kind": "tile/region centre"},
            )
        )
        for r in d["meta"]["dem_rings"]:
            rings.append(
                _feature(
                    {"type": "Polygon", "coordinates": [_circle(x, y, r["max_km"] * 1000)]},
                    {"id": d["id"], "dem": r["source"], "res_m": r["res_m"], "max_km": r["max_km"]},
                )
            )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, feats in (
            ("site_points", points),
            ("site_centres", centres),
            ("dem_rings", rings),
        ):
            src = Path(tmp) / f"{name}.geojson"
            src.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
            subprocess.run(
                [
                    "ogr2ogr",
                    "-f",
                    "GPKG",
                    "-update",
                    "-append",
                    "-a_srs",
                    CRS,
                    "-nln",
                    name,
                    str(OUT),
                    str(src),
                ],
                check=True,
            )
    print(f"wrote {OUT} ({len(points)} sites, {len(rings)} ring circles)")
    return OUT


if __name__ == "__main__":
    build()
