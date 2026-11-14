"""Add a site by latitude and east longitude to pipeline/sites.extra.json.

    python -m four_lights.add_site amundsen-rim "Amundsen rim" -84.23 69.5

Then compute and publish it like any other site: `python -m four_lights.run_sites amundsen-rim`
(or `./ops/data add ...` at the repo root, which does both). Latitude is planetocentric degrees
(negative = south), longitude is degrees east in (-180, 180]. The site is the given point, snapped
to the centre of its pixel in the finest DEM that covers it.
"""

from __future__ import annotations

import argparse
import json

from four_lights.sites import EXTRA_SITES, SITES, check_extra


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("id", help="kebab-case, e.g. amundsen-rim")
    p.add_argument("name", help='display name, e.g. "Amundsen rim"')
    p.add_argument("lat", type=float, help="latitude in degrees, -90 to -80")
    p.add_argument("lon_e", type=float, help="east longitude in degrees, (-180, 180]")
    a = p.parse_args(argv)
    entry = {"id": a.id, "name": a.name, "lat": a.lat, "lon_e": a.lon_e}
    try:
        check_extra(entry, set(SITES))
    except ValueError as e:
        raise SystemExit(str(e)) from None
    extra = json.loads(EXTRA_SITES.read_text()) if EXTRA_SITES.exists() else []
    extra.append(entry)
    EXTRA_SITES.write_text(json.dumps(extra, indent=2, ensure_ascii=False) + "\n")
    print(f"added {a.id} to {EXTRA_SITES}")


if __name__ == "__main__":
    main()
