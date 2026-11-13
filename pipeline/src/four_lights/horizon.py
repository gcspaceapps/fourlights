"""Terrain horizon profiles: for each 0.5° azimuth sector, the highest terrain in that sector.

Every DEM pixel is projected into the site's east-north-up frame and binned by true azimuth, so a
narrow peak between sector centres can't be missed (no ray marching). Close pixels that span more
than one sector are spread over every sector they cover.

DEMs come as rings, finest first. A point is taken from the finest ring that covers it: inside
that ring's grid, within its `max_km` of the site, and with data there.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from four_lights.dem import Raster, bounds, sample
from four_lights.geometry import (
    F64,
    LocalFrame,
    azimuth_deg,
    elevation_deg,
    ps_to_latlon,
    to_cartesian,
)

SECTORS = 720
STEP_DEG = 0.5
OBSERVER_HEIGHTS_M = (1.0, 2.0, 5.0)
NO_TERRAIN_DEG = -90.0
"""Sector value before any terrain is seen. A finished profile never contains it."""

_COVER_CELL_M = 50.0
"""Cell size of the coverage masks used to decide whether a finer ring has data at a point."""


@dataclass(frozen=True)
class Ring:
    raster: Raster
    max_km: float | None = None
    """Use this DEM out to this distance from the site (planar PS km); None = the whole grid."""


@dataclass
class RingUse:
    source: str
    res_m: float
    pixels: int = 0
    max_dist_m: float = 0.0


@dataclass
class HorizonResult:
    site_x: float
    site_y: float
    lat_deg: float
    lon_e_deg: float
    ground_m: float
    heights_m: tuple[float, ...]
    elev_deg: F64
    """Shape (len(heights_m), SECTORS)."""
    rings: list[RingUse] = field(default_factory=list)

    def profile(self, height_m: float) -> F64:
        return self.elev_deg[self.heights_m.index(height_m)]


def _window(r: Raster, x: float, y: float, max_m: float | None) -> tuple[int, int, int, int] | None:
    """Row/col range of `r` within `max_m` (square) of (x, y), or None if it doesn't overlap."""
    if max_m is None:
        return 0, r.height, 0, r.width
    c0 = max(0, int(np.floor((x - max_m - r.left) / r.res_m)))
    c1 = min(r.width, int(np.ceil((x + max_m - r.left) / r.res_m)))
    r0 = max(0, int(np.floor((r.top - (y + max_m)) / r.res_m)))
    r1 = min(r.height, int(np.ceil((r.top - (y - max_m)) / r.res_m)))
    if c0 >= c1 or r0 >= r1:
        return None
    return r0, r1, c0, c1


class _Coverage:
    """Where a ring would supply data: inside its window, within max_km, and data present."""

    def __init__(self, ring: Ring, x: float, y: float, strip_px: int) -> None:
        r = ring.raster
        self.max2 = None if ring.max_km is None else (ring.max_km * 1000.0) ** 2
        self.site = (x, y)
        win = _window(r, x, y, None if ring.max_km is None else ring.max_km * 1000.0)
        self.mask: np.ndarray | None = None
        if win is None:
            return
        r0, r1, c0, c1 = win
        f = max(1, int(round(_COVER_CELL_M / r.res_m)))
        self.cell = f * r.res_m
        self.left = r.left + c0 * r.res_m
        self.top = r.top - r0 * r.res_m
        nrow, ncol = -(-(r1 - r0) // f), -(-(c1 - c0) // f)
        valid = np.zeros((nrow, ncol), dtype=np.float64)
        count = np.zeros((nrow, ncol), dtype=np.float64)
        rows_per = max(f, (strip_px // max(1, c1 - c0)) // f * f)
        for a in range(r0, r1, rows_per):
            b = min(r1, a + rows_per)
            ok = np.isfinite(r.read(a, b, c0, c1))
            ri = (np.arange(a, b) - r0) // f
            ci = (np.arange(c0, c1) - c0) // f
            np.add.at(valid, (ri[:, None], ci[None, :]), ok)
            np.add.at(count, (ri[:, None], ci[None, :]), 1.0)
        self.mask = valid >= 0.5 * count

    def covers(self, xs: F64, ys: F64, d2: F64) -> np.ndarray:
        if self.mask is None:
            return np.zeros(xs.shape, dtype=bool)
        ci = np.floor((xs - self.left) / self.cell).astype(np.int64)
        ri = np.floor((self.top - ys) / self.cell).astype(np.int64)
        inside = (ci >= 0) & (ci < self.mask.shape[1]) & (ri >= 0) & (ri < self.mask.shape[0])
        if self.max2 is not None:
            inside &= d2 < self.max2
        out = np.zeros(xs.shape, dtype=bool)
        out[inside] = self.mask[ri[inside], ci[inside]]
        return out


def _bin(best: F64, heights: tuple[float, ...], az: F64, horiz: F64, up: F64, res_m: float) -> None:
    """Fold points into the per-sector maxima, spreading near pixels over every sector they span."""
    sector = (az / STEP_DEG).astype(np.int64) % SECTORS
    half_w = np.degrees(np.arctan2(res_m * np.sqrt(0.5), horiz))
    wide = half_w > STEP_DEG / 2
    for i, h in enumerate(heights):
        el = elevation_deg(horiz, up - h)
        np.maximum.at(best[i], sector, el)
        if wide.any():
            lo = np.floor((az[wide] - half_w[wide]) / STEP_DEG).astype(np.int64)
            hi = np.floor((az[wide] + half_w[wide]) / STEP_DEG).astype(np.int64)
            el_w = el[wide]
            for off in range(int((hi - lo).max()) + 1):
                k = lo + off
                sel = k <= hi
                np.maximum.at(best[i], k[sel] % SECTORS, el_w[sel])


def site_ground(rings: list[Ring], x: float, y: float) -> tuple[float, str]:
    """Ground height at (x, y) from the finest ring with data there."""
    for ring in rings:
        h = sample(ring.raster, x, y)
        if np.isfinite(h):
            return h, ring.raster.name
    raise ValueError(f"no DEM has data at ({x}, {y})")


def compute_horizon(
    x: float,
    y: float,
    rings: list[Ring],
    heights_m: tuple[float, ...] = OBSERVER_HEIGHTS_M,
    *,
    cover: bool = True,
    strip_px: int = 2_000_000,
    progress: bool = False,
    ground_m: float | None = None,
    allow_gaps: bool = False,
) -> HorizonResult:
    """Horizon profiles at (x, y) (PS metres) for each observer height.

    `cover=False` uses every pixel of every ring within its max_km, and `ground_m` / `allow_gaps`
    let one ring run on its own: both are for the brute-force check, never the product.
    """
    ground = site_ground(rings, x, y)[0] if ground_m is None else ground_m
    lat, lon = ps_to_latlon(x, y)
    frame = LocalFrame.at(float(lat), float(lon), ground)
    best = np.full((len(heights_m), SECTORS), NO_TERRAIN_DEG)
    covers: list[_Coverage] = []
    uses: list[RingUse] = []

    for ring in rings:
        r = ring.raster
        use = RingUse(source=r.name, res_m=r.res_m)
        max_m = None if ring.max_km is None else ring.max_km * 1000.0
        win = _window(r, x, y, max_m)
        if win is not None:
            r0, r1, c0, c1 = win
            xs_row = r.left + (np.arange(c0, c1) + 0.5) * r.res_m
            rows_per = max(1, strip_px // (c1 - c0))
            for a in range(r0, r1, rows_per):
                b = min(r1, a + rows_per)
                h = r.read(a, b, c0, c1)
                ys = (r.top - (np.arange(a, b) + 0.5) * r.res_m)[:, None]
                xs = np.broadcast_to(xs_row[None, :], h.shape)
                ys = np.broadcast_to(ys, h.shape)
                d2 = (xs - x) ** 2 + (ys - y) ** 2
                m = np.isfinite(h) & (d2 >= r.res_m**2)
                if max_m is not None:
                    m &= d2 < max_m**2
                if cover:
                    for c in covers:
                        if not m.any():
                            break
                        m &= ~c.covers(xs, ys, d2)
                if not m.any():
                    continue
                px, py, ph = xs[m], ys[m], h[m]
                plat, plon = ps_to_latlon(px, py)
                e, n, u = frame.enu(*to_cartesian(plat, plon, ph))
                horiz = np.hypot(e, n)
                _bin(best, heights_m, azimuth_deg(e, n), horiz, u, r.res_m)
                use.pixels += int(m.sum())
                use.max_dist_m = max(use.max_dist_m, float(np.sqrt(d2[m].max())))
        if progress:
            km = use.max_dist_m / 1000
            print(f"  ring {r.name}: {use.pixels:,} px to {km:.1f} km", flush=True)
        uses.append(use)
        if cover:
            covers.append(_Coverage(ring, x, y, strip_px))

    if not allow_gaps and (best == NO_TERRAIN_DEG).any():
        missing = int((best == NO_TERRAIN_DEG).sum())
        raise ValueError(f"{missing} sector values saw no terrain")
    return HorizonResult(
        site_x=x,
        site_y=y,
        lat_deg=float(np.degrees(lat)),
        lon_e_deg=float(np.degrees(lon)),
        ground_m=ground,
        heights_m=tuple(heights_m),
        elev_deg=best,
        rings=uses,
    )


def ring_overlap_check(
    fine: Raster, coarse: Raster, x: float, y: float, radius_m: float, n: int = 4000, seed: int = 0
) -> dict[str, float] | None:
    """Height differences (fine - coarse) at random points where both rasters have data."""
    rng = np.random.default_rng(seed)
    fl, fb, fr, ft = bounds(fine)
    cl, cb, cr, ct = bounds(coarse)
    lo_x, hi_x = max(fl, cl, x - radius_m), min(fr, cr, x + radius_m)
    lo_y, hi_y = max(fb, cb, y - radius_m), min(ft, ct, y + radius_m)
    if lo_x >= hi_x or lo_y >= hi_y:
        return None
    px = rng.uniform(lo_x, hi_x, n)
    py = rng.uniform(lo_y, hi_y, n)
    diffs = []
    for a, b in zip(px, py, strict=True):
        hf, hc = sample(fine, a, b), sample(coarse, a, b)
        if np.isfinite(hf) and np.isfinite(hc):
            diffs.append(hf - hc)
    if len(diffs) < 50:
        return None
    d = np.asarray(diffs)
    return {
        "n": float(len(d)),
        "median_m": float(np.median(d)),
        "median_abs_m": float(np.median(np.abs(d))),
        "p95_abs_m": float(np.percentile(np.abs(d), 95)),
    }
