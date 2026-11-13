"""Moon-fixed geometry on the 1737.4 km reference sphere.

Polar stereographic coordinates follow IAU_2015:30135 (`+proj=stere +lat_0=-90 +lon_0=0 +k=1
+R=1737400`), the CRS of every LOLA product used here. Directions are worked in 3D Moon-fixed
Cartesian and the site's local east-north-up frame, so azimuth is from TRUE north (at a south-pole
site true north points directly away from the pole) and curvature is exact.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from four_lights import MOON_RADIUS_M

F64 = NDArray[np.float64]


def ps_to_latlon(x: F64 | float, y: F64 | float) -> tuple[F64, F64]:
    """South polar stereographic metres -> (latitude, east longitude) in radians."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho = np.hypot(x, y)
    lat = 2.0 * np.arctan(rho / (2.0 * MOON_RADIUS_M)) - np.pi / 2.0
    lon = np.arctan2(x, y)
    return lat, lon


def latlon_to_ps(lat: F64 | float, lon: F64 | float) -> tuple[F64, F64]:
    """(latitude, east longitude) in radians -> south polar stereographic metres."""
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    rho = 2.0 * MOON_RADIUS_M * np.tan((np.pi / 2.0 + lat) / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def to_cartesian(lat: F64, lon: F64, height_m: F64) -> tuple[F64, F64, F64]:
    """Moon-fixed Cartesian metres for points `height_m` above the reference sphere."""
    r = MOON_RADIUS_M + height_m
    cl = np.cos(lat)
    return r * cl * np.cos(lon), r * cl * np.sin(lon), r * np.sin(lat)


@dataclass(frozen=True)
class LocalFrame:
    """East-north-up frame at a site, with the observer's ground point."""

    origin: tuple[float, float, float]
    east: tuple[float, float, float]
    north: tuple[float, float, float]
    up: tuple[float, float, float]

    @classmethod
    def at(cls, lat: float, lon: float, ground_height_m: float) -> LocalFrame:
        sl, cl = np.sin(lat), np.cos(lat)
        so, co = np.sin(lon), np.cos(lon)
        r = MOON_RADIUS_M + ground_height_m
        return cls(
            origin=(r * cl * co, r * cl * so, r * sl),
            east=(-so, co, 0.0),
            north=(-sl * co, -sl * so, cl),
            up=(cl * co, cl * so, sl),
        )

    def enu(self, px: F64, py: F64, pz: F64) -> tuple[F64, F64, F64]:
        """Offsets of Cartesian points from the ground point, in the local frame (metres)."""
        dx = px - self.origin[0]
        dy = py - self.origin[1]
        dz = pz - self.origin[2]
        e = dx * self.east[0] + dy * self.east[1] + dz * self.east[2]
        n = dx * self.north[0] + dy * self.north[1] + dz * self.north[2]
        u = dx * self.up[0] + dy * self.up[1] + dz * self.up[2]
        return e, n, u


def azimuth_deg(e: F64, n: F64) -> F64:
    """Azimuth clockwise from true north, degrees in [0, 360)."""
    return np.mod(np.degrees(np.arctan2(e, n)), 360.0)


def elevation_deg(horizontal_m: F64, up_m: F64) -> F64:
    """Elevation above the local horizontal plane, degrees."""
    return np.degrees(np.arctan2(up_m, horizontal_m))


def horizon_dip_deg(observer_height_m: float) -> float:
    """Dip of the geometric horizon of a bare sphere seen from `observer_height_m` up."""
    return float(np.degrees(np.arccos(MOON_RADIUS_M / (MOON_RADIUS_M + observer_height_m))))
