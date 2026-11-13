"""Site definitions and the rule that picks each site's pixel (see _shared/sites.md).

S2 covers Shackleton rim; S4 adds the other sites and recomputes every centre from the raw files.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from four_lights.dem import Raster, bounds

SITE_RADIUS_M = 2000.0
"""The site pixel is the highest DEM pixel within this distance of the tile or region centre."""


@dataclass(frozen=True)
class SiteSpec:
    id: str
    name: str
    source: str
    pgda_site: str | None = None
    """PGDA 5 m tile id (e.g. 'Site04'); its centre is taken from the GeoTIFF bounds."""
    fixed_point: tuple[float, float] | None = None
    """A published point to use as-is (PS metres), instead of the highest-pixel rule."""


SITES: dict[str, SiteSpec] = {
    s.id: s
    for s in [
        SiteSpec("shackleton-rim", "Shackleton rim", "PGDA Site04", pgda_site="Site04"),
    ]
}


@dataclass(frozen=True)
class SitePoint:
    x: float
    y: float
    centre_x: float
    centre_y: float
    rule: str


def tile_centre(r: Raster) -> tuple[float, float]:
    left, bottom, right, top = bounds(r)
    return (left + right) / 2.0, (bottom + top) / 2.0


def highest_within(
    r: Raster, cx: float, cy: float, radius_m: float = SITE_RADIUS_M
) -> tuple[float, float]:
    """Centre of the highest pixel of `r` within `radius_m` of (cx, cy)."""
    c0 = max(0, int(np.floor((cx - radius_m - r.left) / r.res_m)))
    c1 = min(r.width, int(np.ceil((cx + radius_m - r.left) / r.res_m)))
    r0 = max(0, int(np.floor((r.top - cy - radius_m) / r.res_m)))
    r1 = min(r.height, int(np.ceil((r.top - cy + radius_m) / r.res_m)))
    h = r.read(r0, r1, c0, c1)
    xs = r.left + (np.arange(c0, c1) + 0.5) * r.res_m
    ys = r.top - (np.arange(r0, r1) + 0.5) * r.res_m
    d2 = (xs[None, :] - cx) ** 2 + (ys[:, None] - cy) ** 2
    h = np.where((d2 <= radius_m**2) & np.isfinite(h), h, -np.inf)
    i, j = np.unravel_index(int(np.argmax(h)), h.shape)
    if not np.isfinite(h[i, j]):
        raise ValueError(f"no data within {radius_m} m of ({cx}, {cy}) in {r.name}")
    return float(xs[j]), float(ys[i])


def site_point(spec: SiteSpec, tile: Raster | None) -> SitePoint:
    if spec.fixed_point is not None:
        x, y = spec.fixed_point
        return SitePoint(x, y, x, y, f"published point ({x / 1000:.2f}, {y / 1000:.2f}) km")
    if tile is None:
        raise ValueError(f"{spec.id}: needs a tile or a fixed point")
    cx, cy = tile_centre(tile)
    x, y = highest_within(tile, cx, cy)
    km = SITE_RADIUS_M / 1000
    return SitePoint(
        x,
        y,
        cx,
        cy,
        f"highest {tile.res_m:g} m pixel within {km:g} km of the "
        f"{spec.source} tile centre ({cx / 1000:.2f}, {cy / 1000:.2f}) km",
    )
