"""Elevation rasters: LOLA GeoTIFFs and PDS .IMG/.LBL grids behind one small interface.

Heights are metres above the 1737.4 km reference sphere, NaN where there is no data.

Trap: PDS polar `.IMG` grids store 16-bit integers. Height = DN * SCALING_FACTOR. GDAL reports the
label's OFFSET (1737400, the sphere radius) as the band offset, so applying GDAL's scale AND offset
gives planetary radius, not height. We read raw DNs and apply SCALING_FACTOR only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np
import rasterio
from pyproj import CRS
from rasterio.windows import Window

from four_lights import MOON_RADIUS_M
from four_lights.geometry import F64

SOUTH_POLAR_STEREO = CRS.from_proj4(
    f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={MOON_RADIUS_M:.0f} +units=m +no_defs"
)


def same_projection(crs: CRS) -> bool:
    """True if `crs` maps lat/lon exactly like IAU_2015:30135 (k=1 and lat_ts=-90 are the same).

    Compared by transforming points rather than by definition text, which differs between files.
    """
    from pyproj import Transformer

    geo = SOUTH_POLAR_STEREO.geodetic_crs
    ref = Transformer.from_crs(geo, SOUTH_POLAR_STEREO, always_xy=True)
    other = Transformer.from_crs(geo, crs, always_xy=True)
    lons = np.array([0.0, 45.0, -120.0, 170.0])
    lats = np.array([-89.9, -88.0, -85.0, -76.0])
    ax, ay = ref.transform(lons, lats)
    bx, by = other.transform(lons, lats)
    return bool(np.allclose(ax, bx, atol=1e-3) and np.allclose(ay, by, atol=1e-3))


class Raster(Protocol):
    """A north-up grid in south polar stereographic metres, pixel-registered."""

    name: str
    res_m: float
    left: float
    top: float
    width: int
    height: int

    def read(self, row0: int, row1: int, col0: int, col1: int) -> F64:
        """Heights for rows [row0, row1) and columns [col0, col1), NaN for no data."""
        ...


def bounds(r: Raster) -> tuple[float, float, float, float]:
    """(left, bottom, right, top) outer edges in metres."""
    return r.left, r.top - r.height * r.res_m, r.left + r.width * r.res_m, r.top


def col_of(r: Raster, x: F64 | float) -> F64:
    return np.floor((np.asarray(x) - r.left) / r.res_m)


def row_of(r: Raster, y: F64 | float) -> F64:
    return np.floor((r.top - np.asarray(y)) / r.res_m)


def sample(r: Raster, x: float, y: float) -> float:
    """Height of the pixel containing (x, y); NaN outside the grid."""
    c, w = int(col_of(r, x)), int(row_of(r, y))
    if not (0 <= c < r.width and 0 <= w < r.height):
        return float("nan")
    return float(r.read(w, w + 1, c, c + 1)[0, 0])


@dataclass
class ArrayRaster:
    """In-memory raster (tests and synthetic terrain)."""

    name: str
    res_m: float
    left: float
    top: float
    data: F64
    width: int = field(init=False)
    height: int = field(init=False)

    def __post_init__(self) -> None:
        self.data = np.asarray(self.data, dtype=np.float64)
        self.height, self.width = self.data.shape

    def read(self, row0: int, row1: int, col0: int, col1: int) -> F64:
        return self.data[row0:row1, col0:col1].copy()


def parse_pds_label(lbl: Path) -> dict[str, str]:
    """Top-level `KEY = value` pairs of a PDS3 label (units and quotes stripped)."""
    out: dict[str, str] = {}
    for line in lbl.read_text(errors="replace").splitlines():
        m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$", line)
        if m and m.group(1) not in out:
            out[m.group(1)] = re.sub(r"\s*<[^>]*>", "", m.group(2)).strip().strip('"')
    return out


class FileRaster:
    """A LOLA product on disk: PGDA Float32 GeoTIFF or PDS `.LBL` + `.IMG`."""

    def __init__(self, path: Path, name: str | None = None) -> None:
        self.path = Path(path)
        self.name = name or self.path.stem
        self._ds = rasterio.open(self.path)
        ds = self._ds
        if not same_projection(CRS.from_wkt(ds.crs.to_wkt())):
            raise ValueError(f"{self.path}: unexpected CRS {ds.crs.to_proj4()}")
        t = ds.transform
        if not (t.b == 0 and t.d == 0 and t.a == -t.e and t.a > 0):
            raise ValueError(f"{self.path}: not a north-up square grid: {t}")
        self.res_m = float(t.a)
        self.left = float(t.c)
        self.top = float(t.f)
        self.width = ds.width
        self.height = ds.height
        self._nodata = ds.nodata

        if self.path.suffix.upper() == ".LBL":
            label = parse_pds_label(self.path)
            self.scale = float(label["SCALING_FACTOR"])
            label_offset = float(label["OFFSET"])
            if label_offset != MOON_RADIUS_M:
                raise ValueError(f"{self.path}: OFFSET {label_offset} is not the reference sphere")
            if ds.scales[0] != self.scale or ds.offsets[0] != label_offset:
                raise ValueError(
                    f"{self.path}: GDAL scale/offset {ds.scales[0]}/{ds.offsets[0]} "
                    f"disagree with the label {self.scale}/{label_offset}"
                )
        else:
            if ds.dtypes[0] != "float32" or ds.scales[0] != 1 or ds.offsets[0] != 0:
                raise ValueError(f"{self.path}: expected unscaled Float32 metres")
            self.scale = 1.0

    def read(self, row0: int, row1: int, col0: int, col1: int) -> F64:
        win = Window.from_slices((row0, row1), (col0, col1))
        raw = self._ds.read(1, window=win)
        out = raw.astype(np.float64)
        if self._nodata is not None and not np.isnan(self._nodata):
            out[raw == self._nodata] = np.nan
        out *= self.scale
        return out

    def close(self) -> None:
        self._ds.close()
