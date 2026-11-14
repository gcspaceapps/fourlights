"""Sun and Earth apparent azimuth/elevation from a lunar site: JPL Horizons, with SPICE fallback.

Horizons: CENTER='coord@301', COORD_TYPE='GEODETIC', QUANTITIES='4' (airless apparent az/el of
the target centre; azimuth clockwise from north). Site frame MEAN_ME on the 1737.4 km sphere,
ephemeris DE441. Raw responses are cached in data/raw/horizons/.

SPICE: DE440s + the Moon PA kernel + the frames kernel whose MOON_ME is MOON_ME_DE440_ME421, the
same mean-Earth frame as the LOLA DEMs. Apparent direction with light time and stellar
aberration (LT+S), turned into az/el in the site's east-north-up frame.
"""

from __future__ import annotations

import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np

from four_lights.geometry import F64, LocalFrame, azimuth_deg, elevation_deg
from four_lights.paths import RAW_HORIZONS, RAW_SPICE

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}
SPICE_NAMES = {"sun": "SUN", "earth": "EARTH"}
KERNELS = [
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
]


@dataclass(frozen=True)
class TimeRange:
    name: str
    start: datetime
    n: int
    step_min: int

    @property
    def stop(self) -> datetime:
        return self.start + timedelta(minutes=self.step_min * (self.n - 1))

    def times(self) -> list[datetime]:
        return [self.start + timedelta(minutes=self.step_min * i) for i in range(self.n)]

    @property
    def start_utc(self) -> str:
        return self.start.strftime("%Y-%m-%dT%H:%M:%SZ")


def _utc(*a: int) -> datetime:
    return datetime(*a, tzinfo=UTC)


PRODUCT = TimeRange("product", _utc(2028, 1, 1), 731 * 24, 60)
"""2028-01-01 00:00 to 2029-12-31 23:00 UTC, hourly: 17,544 steps."""
VALIDATION = TimeRange("validation", _utc(2024, 1, 1), 731 * 24, 60)
"""2024-01-01 00:00 to 2025-12-31 23:00 UTC, hourly (Barker 2021's window)."""
PHOTO = TimeRange("photo-2026-11-14", _utc(2026, 11, 14, 8), 241, 1)
"""2026-11-14 08:00 to 12:00 UTC, every minute."""
RANGES = {r.name: r for r in (PRODUCT, VALIDATION, PHOTO)}


@dataclass(frozen=True)
class Site:
    id: str
    lat: float
    lon_e: float
    elev_m: float


@dataclass
class Track:
    az: F64
    el: F64


_ROW = re.compile(
    r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}),[^,]*,[^,]*,\s*([-\d.]+),\s*([-\d.]+),"
)


def parse_horizons(text: str) -> tuple[list[datetime], F64, F64]:
    """Rows between $$SOE and $$EOE of a CSV, degree-format QUANTITIES='4' response."""
    if "$$SOE" not in text or "$$EOE" not in text:
        tail = text.strip().splitlines()[-5:]
        raise ValueError("Horizons response has no complete $$SOE/$$EOE block: " + " | ".join(tail))
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    times, az, el = [], [], []
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if not m:
            raise ValueError(f"unparsed Horizons row: {line!r}")
        times.append(datetime.strptime(m.group(1), "%Y-%b-%d %H:%M").replace(tzinfo=UTC))
        az.append(float(m.group(2)))
        el.append(float(m.group(3)))
    return times, np.asarray(az), np.asarray(el)


def _site_coord(site: Site) -> str:
    return f"{site.lon_e % 360:.6f},{site.lat:.6f},{site.elev_m / 1000:.4f}"


def horizons(body: str, site: Site, rng: TimeRange, *, retries: int = 3) -> Track:
    """One Horizons request per site, body and range; raw response cached."""
    RAW_HORIZONS.mkdir(parents=True, exist_ok=True)
    cache = RAW_HORIZONS / f"{site.id}_{body}_{rng.name}_{_site_coord(site).replace(',', '_')}.txt"
    if cache.exists():
        text = cache.read_text()
    else:
        params = {
            "format": "text",
            "COMMAND": f"'{BODIES[body]}'",
            "CENTER": "'coord@301'",
            "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{_site_coord(site)}'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'OBSERVER'",
            "START_TIME": f"'{rng.start:%Y-%m-%d %H:%M}'",
            "STOP_TIME": f"'{rng.stop:%Y-%m-%d %H:%M}'",
            "STEP_SIZE": f"'{rng.step_min} m'",
            "QUANTITIES": "'4'",
            "ANG_FORMAT": "'DEG'",
            "CSV_FORMAT": "'YES'",
            "EXTRA_PREC": "'YES'",
            "TIME_DIGITS": "'MINUTES'",
        }
        url = API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "four-lights-pipeline"})
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    text = r.read().decode()
                break
            except OSError:
                if attempt == retries - 1:
                    raise
                time.sleep(5 * (attempt + 1))
        times, _, _ = parse_horizons(text)  # validate before caching
        cache.write_text(text)
    times, az, el = parse_horizons(text)
    expected = rng.times()
    if len(times) != rng.n:
        raise ValueError(f"{cache.name}: {len(times)} rows, expected {rng.n} (truncated?)")
    if times[0] != expected[0] or times[-1] != expected[-1]:
        raise ValueError(
            f"{cache.name}: rows run {times[0]}..{times[-1]}, expected "
            f"{expected[0]}..{expected[-1]}"
        )
    if "Center radii    : 1737.4, 1737.4, 1737.4" not in text:
        raise ValueError(f"{cache.name}: site not on the 1737.4 km sphere")
    return Track(az, el)


_spice_loaded = False


def _load_spice() -> None:
    global _spice_loaded
    if _spice_loaded:
        return
    import spiceypy as sp

    for k in KERNELS:
        sp.furnsh(str(RAW_SPICE / k))
    _spice_loaded = True


def spice(body: str, site: Site, rng: TimeRange) -> Track:
    """The same az/el from SPICE: DE440s, MOON_ME = MOON_ME_DE440_ME421, LT+S correction."""
    import spiceypy as sp

    _load_spice()
    lat, lon = np.radians(site.lat), np.radians(site.lon_e)
    frame = LocalFrame.at(float(lat), float(lon), site.elev_m)
    obs_km = np.array(frame.origin) / 1000.0
    t0 = sp.str2et(rng.start.strftime("%Y-%m-%d %H:%M:%S UTC"))
    ets = t0 + 60.0 * rng.step_min * np.arange(rng.n)
    pos = np.empty((rng.n, 3))
    for i, et in enumerate(ets):
        state, _ = sp.spkcpo(
            SPICE_NAMES[body], et, "MOON_ME", "OBSERVER", "LT+S", obs_km, "MOON", "MOON_ME"
        )
        pos[i] = state[:3]
    e = pos @ np.array(frame.east)
    n = pos @ np.array(frame.north)
    u = pos @ np.array(frame.up)
    return Track(azimuth_deg(e, n), elevation_deg(np.hypot(e, n), u))


def compare(a: Track, b: Track) -> dict[str, float]:
    daz = (a.az - b.az + 180.0) % 360.0 - 180.0
    return {
        "max_abs_az_deg": float(np.abs(daz).max()),
        "max_abs_el_deg": float(np.abs(a.el - b.el).max()),
        "median_abs_el_deg": float(np.median(np.abs(a.el - b.el))),
    }


def wrap360(a: float) -> float:
    """Angle in [0, 360). Plain `% 360` returns 360.0 for -0.0 and tiny negatives."""
    v = float(a) % 360.0
    return 0.0 if v >= 360.0 else v


def mean_azimuth_deg(az: F64) -> float:
    """Circular mean of azimuths, degrees in [0, 360)."""
    r = np.radians(az)
    return wrap360(np.degrees(np.arctan2(np.sin(r).mean(), np.cos(r).mean())))


def expected_earth_azimuth_deg(lon_e: float) -> float:
    """From near the south pole, Earth (near the sub-Earth point at 0°E, 0°N) is at azimuth
    ~ -lon_e: along the site's meridian (0°) at 0°E, across the pole (~180°) at 180°."""
    return wrap360(-lon_e)
