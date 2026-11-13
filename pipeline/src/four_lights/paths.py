"""Repository paths, resolved from this file so commands work from any directory."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
RAW_LOLA = REPO / "data" / "raw" / "lola"
DERIVED = REPO / "data" / "derived"
HORIZON_OUT = DERIVED / "horizons"
PUBLIC_DATA = REPO / "web" / "public" / "data"
MEDIA = REPO / "stages" / "02_build" / "output" / "media"
DATA_MANIFEST = REPO / "stages" / "01_data" / "output" / "data-manifest.md"
