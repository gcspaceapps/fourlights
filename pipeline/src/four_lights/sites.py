"""The 12 curated sites and the rule that picks each site's pixel (see _shared/sites.md).

Every centre is recomputed from the raw files: PGDA tiles from their GeoTIFF bounds (Site07's tile
is checked against its own point cloud), Artemis regions from the USGS 1 km grids.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from four_lights.dem import Raster, bounds, sample

REGION_RADIUS_M = 8000.0
"""Artemis regions (about 20 km square): the site is the highest summit within this distance of
the region's grid centre, which keeps it inside the region."""
SUMMIT_CLEAR_M = 1000.0
"""A summit has nothing higher within this distance, so it is a real local top, not a point on a
slope at the edge of the search circle."""
SUMMIT_CELL_M = 50.0

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
    region: str | None = None
    """USGS Artemis region zip name (e.g. 'Haworth'); its 1 km grid centre is the centre."""


ARTEMIS = "Artemis region (USGS grid)"

SITES: dict[str, SiteSpec] = {
    s.id: s
    for s in [
        SiteSpec(
            "connecting-ridge",
            "Connecting Ridge",
            "PGDA Site01",
            pgda_site="Site01",
            # Barker et al. 2021, first region centroid (PS km; the PDF drops the minus signs).
            fixed_point=(-11_580.0, -12_460.0),
        ),
        SiteSpec("shackleton-rim", "Shackleton rim", "PGDA Site04", pgda_site="Site04"),
        SiteSpec("peak-near-shackleton", "Peak near Shackleton", "PGDA Site07", pgda_site="Site07"),
        SiteSpec("de-gerlache-rim", "de Gerlache rim", "PGDA Site11", pgda_site="Site11"),
        SiteSpec("mons-mouton", "Mons Mouton", "PGDA Site20 = Artemis region", pgda_site="Site20"),
        SiteSpec(
            "malapert-massif", "Malapert Massif", "PGDA Site23 = Artemis region", pgda_site="Site23"
        ),
        SiteSpec("de-gerlache-rim-2", "de Gerlache Rim 2", ARTEMIS, region="de_Gerlache_Rim_2"),
        SiteSpec("haworth", "Haworth", ARTEMIS, region="Haworth"),
        SiteSpec("nobile-rim-1", "Nobile Rim 1", ARTEMIS, region="Nobile_Rim_1"),
        SiteSpec("nobile-rim-2", "Nobile Rim 2", ARTEMIS, region="Nobile_Rim_2"),
        SiteSpec("peak-near-cabeus-b", "Peak near Cabeus B", ARTEMIS, region="Peak_Near_Cabeus_B"),
        SiteSpec("slater-plain", "Slater Plain", ARTEMIS, region="Slater_Plain"),
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


def highest_summit(
    r: Raster,
    cx: float,
    cy: float,
    radius_m: float = REGION_RADIUS_M,
    clear_m: float = SUMMIT_CLEAR_M,
) -> tuple[float, float] | None:
    """Centre of the highest pixel within `radius_m` that has nothing higher within `clear_m`.

    Works on `SUMMIT_CELL_M` cells (each cell's maximum), then returns the highest pixel of the
    winning cell. None if no cell in range is a local top.
    """
    f = max(1, int(round(SUMMIT_CELL_M / r.res_m)))
    cs = f * r.res_m
    half = radius_m + clear_m
    c0 = max(0, int((cx - half - r.left) // r.res_m))
    c1 = min(r.width, int((cx + half - r.left) // r.res_m) + 1)
    r0 = max(0, int((r.top - cy - half) // r.res_m))
    r1 = min(r.height, int((r.top - cy + half) // r.res_m) + 1)
    h = r.read(r0, r1, c0, c1)
    h = np.where(np.isfinite(h), h, -np.inf)
    rows, cols = (h.shape[0] // f) * f, (h.shape[1] // f) * f
    if rows == 0 or cols == 0:
        return None
    g = h[:rows, :cols].reshape(rows // f, f, cols // f, f).max(axis=(1, 3))
    k = int(round(clear_m / cs))
    pad = np.pad(g, k, constant_values=-np.inf)
    local = g.copy()
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            if dy * dy + dx * dx <= k * k:
                local = np.maximum(
                    local, pad[k + dy : k + dy + g.shape[0], k + dx : k + dx + g.shape[1]]
                )
    ys = r.top - (r0 + (np.arange(g.shape[0]) + 0.5) * f) * r.res_m
    xs = r.left + (c0 + (np.arange(g.shape[1]) + 0.5) * f) * r.res_m
    d = np.hypot(xs[None, :] - cx, ys[:, None] - cy)
    ok = (g >= local) & (d <= radius_m) & np.isfinite(g)
    if not ok.any():
        return None
    i, j = np.unravel_index(int(np.argmax(np.where(ok, g, -np.inf))), g.shape)
    block = h[i * f : (i + 1) * f, j * f : (j + 1) * f]
    a, b = np.unravel_index(int(np.argmax(block)), block.shape)
    return (
        float(r.left + (c0 + j * f + b + 0.5) * r.res_m),
        float(r.top - (r0 + i * f + a + 0.5) * r.res_m),
    )


def site_point(
    spec: SiteSpec, tile: Raster | None, finer_first: list[Raster] | None = None
) -> SitePoint:
    """The site's pixel. Region sites need `finer_first`: the DEMs, finest first."""
    if spec.region is not None:
        from four_lights.paths import RAW
        from four_lights.regions import region_centre

        c = region_centre(RAW / "usgs" / f"{spec.region}.zip")
        for r in finer_first or []:
            if np.isfinite(sample(r, c.x, c.y)):
                found = highest_summit(r, c.x, c.y)
                if found is None:  # no summit in range: fall back to the highest pixel nearby
                    x, y = highest_within(r, c.x, c.y)
                    how = (
                        f"highest {r.res_m:g} m pixel ({r.name}) within {SITE_RADIUS_M / 1000:g} km"
                    )
                else:
                    x, y = found
                    how = (
                        f"highest summit ({r.name}, {r.res_m:g} m; nothing higher within "
                        f"{SUMMIT_CLEAR_M / 1000:g} km) within {REGION_RADIUS_M / 1000:g} km"
                    )
                return SitePoint(
                    x,
                    y,
                    c.x,
                    c.y,
                    f"{how} of the USGS {spec.region} grid centre "
                    f"({c.x / 1000:.2f}, {c.y / 1000:.2f}) km",
                )
        raise ValueError(f"{spec.id}: no DEM has data at the region centre")
    if spec.fixed_point is not None:
        x, y = spec.fixed_point
        if tile is not None:
            left, bottom, right, top = bounds(tile)
            if not (left < x < right and bottom < y < top):
                raise ValueError(f"{spec.id}: published point ({x}, {y}) is outside {tile.name}")
            # Snap to the containing pixel's centre, so the observer stands on a DEM sample.
            sx = tile.left + (np.floor((x - tile.left) / tile.res_m) + 0.5) * tile.res_m
            sy = tile.top - (np.floor((tile.top - y) / tile.res_m) + 0.5) * tile.res_m
        else:
            sx, sy = x, y
        return SitePoint(
            float(sx),
            float(sy),
            x,
            y,
            f"Barker et al. 2021 region centroid ({x / 1000:.2f}, {y / 1000:.2f}) km, "
            f"snapped to its pixel centre",
        )
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
