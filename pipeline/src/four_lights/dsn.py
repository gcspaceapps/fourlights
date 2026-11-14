"""Canberra Link: which Deep Space Network 70 m station can see the Moon, hour by hour.

A station "sees" the Moon when the Moon's centre is at least 10° above its local horizon
(DSN 810-005 module 301: no transmitting below 10.1°; see _shared/validation.md). Computed with
SPICE: station positions and topocentric frames from NAIF's earthstns_itrf93 kernels, Earth
orientation from the long-term predict PCK (the product range is in the future). The Moon's
centre stands in for the landing site: from Earth the two are at most 0.26° apart.

Bitmask per time step: bit 0 Goldstone DSS-14, bit 1 Canberra DSS-43, bit 2 Madrid DSS-63.
"""

from __future__ import annotations

import numpy as np

from four_lights.ephem import KERNELS, TimeRange
from four_lights.paths import RAW_SPICE

STATIONS = (("DSS-14", "Goldstone", 1), ("DSS-43", "Canberra", 2), ("DSS-63", "Madrid", 4))
MASK_DEG = 10.0
DSN_KERNELS = [
    "earthstns_itrf93_260814.bsp",
    "earth_topo_260814.tf",
    "earth_2026_260806_2126_predict.bpc",
]

_loaded = False


def _load() -> None:
    global _loaded
    if _loaded:
        return
    import spiceypy as sp

    for k in [*KERNELS, *DSN_KERNELS]:
        sp.furnsh(str(RAW_SPICE / k))
    _loaded = True


def moon_elevation_deg(station: str, rng: TimeRange) -> np.ndarray:
    """Apparent elevation of the Moon's centre from a DSN station, degrees, per time step."""
    import spiceypy as sp

    _load()
    t0 = sp.str2et(rng.start.strftime("%Y-%m-%d %H:%M:%S UTC"))
    ets = t0 + 60.0 * rng.step_min * np.arange(rng.n)
    el = np.empty(rng.n)
    for i, et in enumerate(ets):
        pos, _ = sp.spkpos("MOON", et, f"{station}_TOPO", "LT+S", station)
        el[i] = np.degrees(np.arcsin(pos[2] / np.linalg.norm(pos)))
    return el


_mask_cache: dict[str, np.ndarray] = {}


def station_mask(rng: TimeRange) -> np.ndarray:
    """One bitmask per time step: which stations have the Moon at >= MASK_DEG."""
    if rng.name in _mask_cache:
        return _mask_cache[rng.name]
    mask = np.zeros(rng.n, dtype=np.int64)
    for station, _, bit in STATIONS:
        mask |= np.where(moon_elevation_deg(station, rng) >= MASK_DEG, bit, 0)
    _mask_cache[rng.name] = mask
    return mask
