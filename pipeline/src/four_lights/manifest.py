"""Append a row per output file to stages/01_data/output/data-manifest.md."""

from __future__ import annotations

import platform
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from four_lights.paths import DATA_MANIFEST, REPO
from four_lights.sources import RawFile

AEST = ZoneInfo("Australia/Brisbane")


def _size(p: Path) -> str:
    n = p.stat().st_size
    return f"{n / 1e6:.1f} MB" if n >= 1e6 else f"{n / 1e3:.0f} kB"


def log_run(
    command: str, inputs: list[RawFile], outputs: list[Path], seconds: float, note: str = ""
) -> None:
    when = datetime.now(AEST).strftime("%a %H:%M")
    machine = f"{platform.node()} ({platform.machine()})"
    ins = "; ".join(
        [f"{Path(f.rel).name} {f.sha256[:8]}" for f in inputs] + ([note] if note else [])
    )
    rows = [
        f"| {when} | {machine} | `{command}` | {ins} | `{o.relative_to(REPO)}` | {_size(o)} "
        f"| {seconds:.0f} s |"
        for o in outputs
    ]
    with DATA_MANIFEST.open("a") as f:
        f.write("\n".join(rows) + "\n")
