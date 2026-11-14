import json
from pathlib import Path

import numpy as np
import pytest

from four_lights.dem import ArrayRaster
from four_lights.geometry import latlon_to_ps
from four_lights.sites import SITES, SiteSpec, check_extra, load_extra, site_point


def test_extra_site_is_the_given_point_on_the_finest_dem_that_covers_it() -> None:
    lat, lon = -85.0, 30.0
    x, y = (float(v) for v in latlon_to_ps(np.radians(lat), np.radians(lon)))
    hole = np.full((40, 40), np.nan)  # a finer DEM with no data at the point is skipped
    fine = ArrayRaster("fine", 5.0, x - 100, y + 100, hole)
    coarse = ArrayRaster("coarse", 20.0, x - 1003, y + 1007, np.zeros((100, 100)))
    spec = SiteSpec("somewhere", "Somewhere", "Added point (lat, lon)", lat_lon=(lat, lon))
    pt = site_point(spec, None, [fine, coarse])
    assert abs(pt.x - x) <= 10 and abs(pt.y - y) <= 10
    assert (pt.x - coarse.left) / 20 % 1 == pytest.approx(0.5)
    assert (coarse.top - pt.y) / 20 % 1 == pytest.approx(0.5)
    assert "20 m pixel centre (coarse)" in pt.rule
    assert pt.rule.endswith(f"({x / 1000:.2f}, {y / 1000:.2f}) km")  # sites_table reads this


def test_extra_site_off_every_dem_is_an_error() -> None:
    spec = SiteSpec("nowhere", "Nowhere", "x", lat_lon=(-85.0, 30.0))
    with pytest.raises(ValueError, match="no DEM has data"):
        site_point(spec, None, [ArrayRaster("far", 20.0, 0.0, 0.0, np.zeros((5, 5)))])


@pytest.mark.parametrize(
    "entry, why",
    [
        ({"id": "Bad Id", "name": "x", "lat": -85, "lon_e": 0}, "kebab-case"),
        ({"id": "fake-d", "name": "x", "lat": -85, "lon_e": 0}, "fixtures"),
        ({"id": "haworth", "name": "x", "lat": -85, "lon_e": 0}, "already used"),
        ({"id": "new-site", "name": " ", "lat": -85, "lon_e": 0}, "name"),
        ({"id": "new-site", "name": "x", "lat": -70, "lon_e": 0}, "latitude"),
        ({"id": "new-site", "name": "x", "lat": -85, "lon_e": 200}, "longitude"),
        ({"id": "new-site", "name": "x", "lat": "south"}, "numeric"),
    ],
)
def test_extra_site_entries_are_checked(entry: dict, why: str) -> None:
    with pytest.raises(ValueError, match=why):
        check_extra(entry, set(SITES))


def test_load_extra_reads_the_file_and_rejects_repeats(tmp_path: Path) -> None:
    f = tmp_path / "sites.extra.json"
    assert load_extra(f) == []
    a = {"id": "new-site", "name": "New site", "lat": -86.5, "lon_e": -45.0}
    f.write_text(json.dumps([a]))
    (spec,) = load_extra(f)
    assert spec.lat_lon == (-86.5, -45.0) and spec.pgda_site is None and spec.region is None
    f.write_text(json.dumps([a, a]))
    with pytest.raises(ValueError, match="already used"):
        load_extra(f)
