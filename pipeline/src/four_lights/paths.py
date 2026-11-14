"""Repository paths, resolved from this file so commands work from any directory."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RAW = REPO / "data" / "raw"
RAW_LOLA = RAW / "lola"
RAW_SPICE = RAW / "spice"
RAW_HORIZONS = RAW / "horizons"
DERIVED = REPO / "data" / "derived"
HORIZON_OUT = DERIVED / "horizons"
EPHEM_OUT = DERIVED / "ephem"
PUBLIC_DATA = REPO / "web" / "public" / "data"
MEDIA = REPO / "stages" / "02_build" / "output" / "media"
DATA_MANIFEST = REPO / "stages" / "01_data" / "output" / "data-manifest.md"
