"""Artemis candidate region centres from the USGS LGRS 1 km navigational grids.

Trap: the grids' CRS is NOT IAU_2015:30135. Their .prj has false easting/northing 500 km and
scale factor 0.994 (`Moon_2015_-_Sphere_Ocentric_South_Polar`). The centre is converted through
pyproj from each file's own .prj, never by hand.

The region centre is the centre of the 1 km grid's extent, read from the shapefile header.
"""

from __future__ import annotations

import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path

from pyproj import CRS, Transformer

from four_lights.dem import SOUTH_POLAR_STEREO
from four_lights.paths import RAW


@dataclass(frozen=True)
class RegionCentre:
    name: str
    grid_x: float
    grid_y: float
    x: float
    """South polar stereographic metres, IAU_2015:30135."""
    y: float
    lat: float
    lon_e: float
    cells: int


def _shp_bbox(data: bytes) -> tuple[float, float, float, float]:
    """(xmin, ymin, xmax, ymax) from an ESRI shapefile main-file header."""
    if struct.unpack(">i", data[0:4])[0] != 9994:
        raise ValueError("not a shapefile")
    return struct.unpack("<4d", data[36:68])


def region_centre(zip_path: Path) -> RegionCentre:
    with zipfile.ZipFile(zip_path) as z:
        shp = next(n for n in z.namelist() if n.endswith("_1km_S_Grid.shp"))
        dbf = shp[:-4] + ".dbf"
        prj = z.read(shp[:-4] + ".prj").decode()
        xmin, ymin, xmax, ymax = _shp_bbox(z.read(shp)[:100])
        cells = struct.unpack("<I", z.read(dbf)[4:8])[0]
    gx, gy = (xmin + xmax) / 2.0, (ymin + ymax) / 2.0
    src = CRS.from_wkt(prj)
    x, y = Transformer.from_crs(src, SOUTH_POLAR_STEREO, always_xy=True).transform(gx, gy)
    lon, lat = Transformer.from_crs(src, src.geodetic_crs, always_xy=True).transform(gx, gy)
    name = Path(shp).name.split("_PolarLGRS")[0]
    return RegionCentre(name, gx, gy, float(x), float(y), float(lat), float(lon), int(cells))


def all_centres() -> list[RegionCentre]:
    return [region_centre(p) for p in sorted((RAW / "usgs").glob("*.zip"))]


if __name__ == "__main__":
    for c in all_centres():
        print(
            f"{c.name:20} grid ({c.grid_x:.0f}, {c.grid_y:.0f}) -> PS ({c.x:9.1f}, {c.y:9.1f}) m"
            f"  {c.lat:8.4f}°, {c.lon_e:9.4f}°E  {c.cells} cells"
        )
