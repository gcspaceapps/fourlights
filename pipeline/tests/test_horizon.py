import os
from pathlib import Path

import numpy as np
import pytest

from four_lights.dem import ArrayRaster, FileRaster
from four_lights.geometry import LocalFrame, horizon_dip_deg, latlon_to_ps, ps_to_latlon
from four_lights.horizon import SECTORS, Ring, compute_horizon


def flat_raster(name: str, cx: float, cy: float, half_m: float, res_m: float) -> ArrayRaster:
    n = int(round(2 * half_m / res_m))
    return ArrayRaster(name, res_m, cx - half_m, cy + half_m, np.zeros((n, n)))


def put(r: ArrayRaster, x: float, y: float, h: float) -> None:
    c = int((x - r.left) // r.res_m)
    w = int((r.top - y) // r.res_m)
    r.data[w, c] = h


def site_xy(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    x, y = latlon_to_ps(np.radians(lat_deg), np.radians(lon_deg))
    return float(x), float(y)


def test_projection_round_trip_matches_shackleton_centre() -> None:
    x, y = site_xy(-89.77, -171.87)
    assert x == pytest.approx(-987, abs=5) and y == pytest.approx(-6905, abs=5)
    lat, lon = ps_to_latlon(x, y)
    assert np.degrees(lat) == pytest.approx(-89.77) and np.degrees(lon) == pytest.approx(-171.87)


def test_peak_away_from_pole_on_own_meridian_is_true_north() -> None:
    lon = -171.87
    sx, sy = site_xy(-89.77, lon)
    r = flat_raster("flat", sx, sy, 6000, 20)
    nx, ny = site_xy(-89.65, lon)  # same meridian, further from the pole (~3.6 km)
    tx, ty = site_xy(-89.85, lon)  # same meridian, toward the pole (~2.4 km)
    put(r, nx, ny, 400.0)
    put(r, tx, ty, 300.0)
    prof = compute_horizon(sx, sy, [Ring(r)], (2.0,)).profile(2.0)
    north = int(
        np.argmax(
            np.where(np.isin(np.arange(SECTORS), [*range(0, 40), *range(680, 720)]), prof, -90)
        )
    )
    assert north in (0, 719), "peak away from the pole must be at azimuth ~0° (true north)"
    assert prof[north] > 5.0
    south = 360 + int(np.argmax(prof[340:380])) - 20
    assert south in (359, 360), "peak toward the pole must be at azimuth ~180°"


def test_flat_sphere_horizon_dip_matches_formula() -> None:
    sx, sy = site_xy(-88.0, 40.0)
    r = flat_raster("sphere", sx, sy, 6000, 10)
    res = compute_horizon(sx, sy, [Ring(r)], (1.0, 2.0, 5.0))
    for h in (1.0, 2.0, 5.0):
        prof = res.profile(h)
        assert np.allclose(prof, -horizon_dip_deg(h), atol=0.003), (h, prof.min(), prof.max())


def test_one_pixel_spike_between_sector_centres_is_seen() -> None:
    sx, sy = site_xy(-87.0, 10.0)
    r = flat_raster("flat", sx, sy, 10000, 20)
    # Sector 20 covers [10.0°, 10.5°); its centre is 10.25°. Put the spike at 10.45°, 8 km out:
    # 28 m off the sector-centre ray, more than one 20 m pixel.
    lat, lon = np.radians(-87.0), np.radians(10.0)
    frame = LocalFrame.at(lat, lon, 0.0)
    az = np.radians(10.45)
    e, n = 8000 * np.sin(az), 8000 * np.cos(az)
    p = np.array(frame.origin) + e * np.array(frame.east) + n * np.array(frame.north)
    plat = np.arcsin(p[2] / np.linalg.norm(p))
    plon = np.arctan2(p[1], p[0])
    px, py = latlon_to_ps(plat, plon)
    put(r, float(px), float(py), 300.0)
    prof = compute_horizon(sx, sy, [Ring(r)], (2.0,)).profile(2.0)
    assert prof[20] > 1.9
    assert prof[19] < 0 and prof[21] < 0


def test_finest_covering_ring_wins() -> None:
    sx, sy = site_xy(-89.0, 60.0)
    fine = flat_raster("fine", sx, sy, 2000, 10)
    coarse = flat_raster("coarse", sx, sy, 8000, 100)
    # A wall in the coarse DEM inside the fine DEM's area: must be ignored.
    coarse.data[:, :] = 0.0
    put(coarse, sx + 1500, sy, 2000.0)
    # A wall in the coarse DEM outside the fine area: must be used.
    put(coarse, sx - 6000, sy, 2000.0)
    res = compute_horizon(sx, sy, [Ring(fine), Ring(coarse)], (2.0,))
    prof = res.profile(2.0)
    assert prof.max() > 10.0  # the far wall, ~18° up
    # Only one wall is visible, so only a few sectors are high.
    assert (prof > 5).sum() < 10
    assert [u.pixels > 0 for u in res.rings] == [True, True]


CACHE = Path(os.environ.get("NASA_CACHE", "/nonexistent")) / "lola-polar-gdr"


@pytest.mark.skipif(not (CACHE / "LDEM_75S_240M.LBL").exists(), reason="needs $NASA_CACHE")
def test_pds_heights_are_scaled_integers_not_radii() -> None:
    r = FileRaster(CACHE / "LDEM_75S_240M.LBL")
    assert r.scale == 0.5
    block = r.read(1800, 1810, 1800, 1810)  # near the pole
    assert np.isfinite(block).all()
    assert block.min() > -10_000 and block.max() < 10_000, "heights, not planetary radius"


def test_near_field_dome_matches_formula() -> None:
    # Observer 2 m up on the top of a smooth dome z = -d^2 / (2 * 500 m). Like a small planet,
    # its horizon is the tangent point, ~45 m out (inside the near field), at
    # -atan(sqrt(2h * (1/Rc + 1/R_moon))) in every direction.
    from four_lights import MOON_RADIUS_M

    rc, h = 500.0, 2.0
    sx, sy = site_xy(-88.5, 75.0)
    r = flat_raster("dome", sx, sy, 600, 5)
    xs = r.left + (np.arange(r.width) + 0.5) * r.res_m
    ys = r.top - (np.arange(r.height) + 0.5) * r.res_m
    d2 = (xs[None, :] - sx) ** 2 + (ys[:, None] - sy) ** 2
    r.data = -d2 / (2 * rc)
    prof = compute_horizon(sx, sy, [Ring(r)], (h,)).profile(h)
    expect = -np.degrees(np.arctan(np.sqrt(2 * h * (1 / rc + 1 / MOON_RADIUS_M))))
    assert np.allclose(prof, expect, atol=0.02), (prof.min(), prof.max(), expect)
    assert prof.std() < 0.01
