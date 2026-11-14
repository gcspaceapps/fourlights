"""Render the computed sites as a markdown table and put it in _shared/sites.md.

    python -m four_lights.sites_table

Replaces everything between the BEGIN/END markers in _shared/sites.md (added on first run, in
place of the provisional table). Reads data/derived/horizons/<id>.json for every site.
"""

from __future__ import annotations

import json
import re

from four_lights.paths import HORIZON_OUT, REPO
from four_lights.sites import SITES

SITES_MD = REPO / "_shared" / "sites.md"
BEGIN = "<!-- BEGIN computed sites (python -m four_lights.sites_table) -->"
END = "<!-- END computed sites -->"


def table() -> str:
    rows = [
        "| # | id | Name | Source | Centre (PS km) | Site point (PS km) | Lat, E-lon | Ground | "
        "Finest DEM under it | approx |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for k, (sid, spec) in enumerate(SITES.items(), start=1):
        p = HORIZON_OUT / f"{sid}.json"
        if not p.exists():
            rows.append(
                f"| {k} | `{sid}` | {spec.name} | {spec.source} | not computed yet | | | | | |"
            )
            continue
        d = json.loads(p.read_text())
        centre = re.findall(r"\((-?[\d.]+), (-?[\d.]+)\) km", d["point_rule"])[-1]
        finest = d.get("ground_source") or d["meta"]["dem_rings"][0]
        approx = finest["res_m"] > 5
        rows.append(
            f"| {k} | `{sid}` | {spec.name} | {spec.source} | {centre[0]}, {centre[1]} | "
            f"{d['ps_x_m'] / 1000:.2f}, {d['ps_y_m'] / 1000:.2f} | "
            f"{d['site']['lat']:.3f}°, {d['site']['lon_e']:.2f}° | {d['site']['elev_m']:.0f} m | "
            f"{finest['source']} ({finest['res_m']:g} m) | {'yes' if approx else 'no'} |"
        )
    return "\n".join(rows)


def main() -> None:
    text = SITES_MD.read_text()
    block = f"{BEGIN}\n{table()}\n{END}"
    if BEGIN in text:
        text = re.sub(re.escape(BEGIN) + ".*?" + re.escape(END), lambda _: block, text, flags=re.S)
    else:
        raise SystemExit(f"add the markers {BEGIN!r} ... {END!r} to {SITES_MD} first")
    SITES_MD.write_text(text)
    print(block)


if __name__ == "__main__":
    main()
