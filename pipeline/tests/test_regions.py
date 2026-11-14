import pytest

from four_lights.paths import RAW
from four_lights.regions import region_centre

ZIPS = RAW / "usgs"


@pytest.mark.skipif(not (ZIPS / "Haworth.zip").exists(), reason="run `make fetch-usgs` first")
def test_lgrs_grid_is_converted_not_copied() -> None:
    # The LGRS grids use false easting/northing 500 km and scale 0.994: (g - 500000) / 0.994.
    c = region_centre(ZIPS / "Haworth.zip")
    assert (c.grid_x, c.grid_y) == (462_500, 590_000)
    assert c.x == pytest.approx((462_500 - 500_000) / 0.994, abs=0.5)
    assert c.y == pytest.approx((590_000 - 500_000) / 0.994, abs=0.5)
    assert c.lat == pytest.approx(-86.766, abs=0.001)


@pytest.mark.skipif(not (ZIPS / "Slater_Plain.zip").exists(), reason="run `make fetch-usgs` first")
def test_cabeus_y_and_slater_x_coincide_for_a_real_reason() -> None:
    # _shared/sites.md flagged both as 69 920 m: both raw grid values are exactly 569 500.
    cab = region_centre(ZIPS / "Peak_Near_Cabeus_B.zip")
    sla = region_centre(ZIPS / "Slater_Plain.zip")
    assert cab.grid_y == sla.grid_x == 569_500
    assert cab.y == pytest.approx(sla.x)
