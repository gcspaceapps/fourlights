import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from four_lights.ephem import (
    PHOTO,
    PRODUCT,
    VALIDATION,
    expected_earth_azimuth_deg,
    mean_azimuth_deg,
    parse_horizons,
)
from four_lights.paths import EPHEM_OUT

FIXTURE = Path(__file__).parent / "fixtures" / "horizons_earth_shackleton_2028.txt"


def test_known_timestamp_parses() -> None:
    times, az, el = parse_horizons(FIXTURE.read_text())
    assert times[0] == datetime(2028, 1, 1, 0, 0, tzinfo=UTC)
    assert times[3] == datetime(2028, 1, 1, 3, 0, tzinfo=UTC)
    assert az[0] == pytest.approx(155.041537534)
    assert el[2] == pytest.approx(2.333530654)


def test_truncated_response_is_rejected() -> None:
    text = FIXTURE.read_text().replace("$$EOE", "")
    with pytest.raises(ValueError, match="SOE"):
        parse_horizons(text)


def test_ranges_match_the_data_contract() -> None:
    assert PRODUCT.n == 17_544 and PRODUCT.stop == datetime(2029, 12, 31, 23, tzinfo=UTC)
    assert VALIDATION.stop == datetime(2025, 12, 31, 23, tzinfo=UTC)
    assert PHOTO.n == 241 and PHOTO.stop == datetime(2026, 11, 14, 12, tzinfo=UTC)


def test_expected_earth_azimuth() -> None:
    assert expected_earth_azimuth_deg(0.0) == 0.0
    assert expected_earth_azimuth_deg(-156.2) == pytest.approx(156.2)
    assert mean_azimuth_deg(np.array([350.0, 10.0])) == pytest.approx(0.0, abs=1e-9)


def _earth(site_id: str) -> tuple[float, float]:
    p = EPHEM_OUT / f"{site_id}.json"
    if not p.exists():
        pytest.skip(f"run `make ephem SITE={site_id}` first")
    d = json.loads(p.read_text())
    return mean_azimuth_deg(np.asarray(d["product"]["earth"]["az"])), d["site"]["lon_e"]


def test_earth_is_north_from_malapert() -> None:
    # Malapert (~0°E): Earth along the site's own meridian, away from the pole: azimuth ~0°.
    az, _ = _earth("malapert-massif")
    assert min(az, 360 - az) < 20


@pytest.mark.parametrize("site_id", ["shackleton-rim", "malapert-massif", "connecting-ridge"])
def test_earth_azimuth_follows_site_longitude(site_id: str) -> None:
    # A flipped north would put Earth 180° away from this.
    az, lon_e = _earth(site_id)
    d = (az - expected_earth_azimuth_deg(lon_e) + 180) % 360 - 180
    assert abs(d) < 10, (site_id, az, lon_e)
