"""The QGIS pack's planner layers, on a tiny made-up site (no GDAL or QGIS needed)."""

import json
from datetime import date
from pathlib import Path

import pytest

from four_lights import qgis_pack
from four_lights.qgis_pack import ROSE_BASE_M, ROSE_M_PER_DEG, direction, layers


def test_north_points_away_from_the_pole_and_east_is_a_quarter_turn() -> None:
    # On the 0 degE meridian (the +y axis in south polar stereographic) north is +y, east is +x.
    assert direction(0, 1000, 0) == pytest.approx((0, 1))
    assert direction(0, 1000, 90) == pytest.approx((1, 0))
    # On the 90 degE meridian (+x) north is +x and east is -y.
    assert direction(1000, 0, 0) == pytest.approx((1, 0))
    assert direction(1000, 0, 90) == pytest.approx((0, -1))
    assert direction(1000, 0, 180) == pytest.approx((-1, 0))


def _fixture(tmp: Path, days: int = 120) -> tuple[Path, Path, Path]:
    horizons, ephem = tmp / "horizons", tmp / "ephem"
    horizons.mkdir()
    ephem.mkdir()
    site = {
        "id": "camp",
        "name": "Camp",
        "ps_x_m": 0.0,
        "ps_y_m": 10_000.0,
        "source": "test",
        "point_rule": "made up",
        "site": {"lat": -89.67, "lon_e": 0.0, "elev_m": 1200.0},
        "horizons": [
            {"height_m": 1.0, "step_deg": 90, "elev_deg": [9.0, 9.0, 9.0, 9.0]},
            {"height_m": 2.0, "step_deg": 90, "elev_deg": [2.0, 0.0, -1.0, 0.0]},
        ],
    }
    (horizons / "camp.json").write_text(json.dumps(site))
    (horizons / "camp.bruteforce.json").write_text("{}")  # a check file: must be skipped
    (ephem / "camp.json").write_text(
        json.dumps(
            {
                "meta": {"checks": {"earth_mean_az_deg": 90.0}},
                "product": {"earth": {"el": [-1.5, 6.25, 3.0]}},
            }
        )
    )
    # Day 0 is 1 Jan 2028; the plan is day 109 and the slipped landing day 112.
    i_plan = (qgis_pack.PLANNED - date(2028, 1, 1)).days
    verdicts = ["r"] * days
    verdicts[i_plan] = "g"
    planner = {
        "start_utc": "2028-01-01T00:00:00Z",
        "height_m": 2.0,
        "windows": {
            "7": {
                "camp": {
                    "u": [10 + (k == i_plan) * 56 for k in range(days)],
                    "s": [50] * days,
                    "d": [72] * days,
                    "v": verdicts,
                }
            }
        },
    }
    (tmp / "planner.json").write_text(json.dumps(planner))
    return tmp / "planner.json", horizons, ephem


def test_layers_carry_the_planners_own_numbers(tmp_path: Path) -> None:
    out = layers(*_fixture(tmp_path))
    assert {k: len(v) for k, v in out.items()} == {
        "sites": 1,
        "planner_daily": 120,
        "skyline": 2,
        "earth_lines": 1,
    }
    site = out["sites"][0]["properties"]
    assert site["plan_date"] == "2028-04-19"
    assert site["slip_date"] == "2028-04-22"
    assert (site["plan_verdict"], site["plan_usable"]) == ("works", 6.6)
    assert (site["slip_verdict"], site["slip_usable"]) == ("no power", 1.0)
    assert site["change"] == "works -> no power"
    first = out["planner_daily"][0]["properties"]
    assert (first["landing"], first["verdict"], first["dark_h"]) == ("2028-01-01", "no power", 72)


def test_skyline_uses_the_planners_observer_height_and_points_north_first(tmp_path: Path) -> None:
    out = layers(*_fixture(tmp_path))
    sky, level = out["skyline"]
    assert sky["properties"]["height_m"] == 2.0  # not the 1 m profile listed first
    assert (sky["properties"]["max_deg"], sky["properties"]["min_deg"]) == (2.0, -1.0)
    ring = sky["geometry"]["coordinates"][0]
    # Azimuth 0 (north, +y here) has 2 deg of terrain: pushed out beyond the level circle.
    assert ring[0] == [0.0, 10_000 + ROSE_BASE_M + 2 * ROSE_M_PER_DEG]
    assert ring[2] == [0.0, 10_000 - (ROSE_BASE_M - ROSE_M_PER_DEG)]  # south, 1 deg below level
    assert ring[-1] == ring[0]
    assert level["geometry"]["coordinates"][0][1] == [ROSE_BASE_M, 10_000.0]  # east, level
    earth = out["earth_lines"][0]
    assert earth["geometry"]["coordinates"][1] == [qgis_pack.EARTH_LINE_M, 10_000.0]  # due east
    assert (earth["properties"]["el_min_deg"], earth["properties"]["el_max_deg"]) == (-1.5, 6.25)
