"""Fetch raw NASA files into data/raw/lola/, verifying size and SHA-256.

Default: download from the original NASA URL; on failure, take the file from $NASA_CACHE (the
offline mirror) after checking its SHA-256. `--cache-first` reverses the order (used when the
original servers are too slow for the schedule; the manifest records which source was used).
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import urllib.request
from pathlib import Path

from four_lights.paths import RAW_LOLA
from four_lights.sources import FILES, RawFile, needed


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(8 << 20):
            h.update(chunk)
    return h.hexdigest()


def _ok(path: Path, f: RawFile) -> bool:
    """Size matches and the SHA-256 matches (cached in a sidecar so big files hash once)."""
    if not path.exists() or path.stat().st_size != f.size:
        return False
    side = path.with_name(path.name + ".sha256")
    if side.exists() and side.stat().st_mtime >= path.stat().st_mtime:
        return side.read_text().strip() == f.sha256
    digest = sha256(path)
    side.write_text(digest + "\n")
    return digest == f.sha256


def _from_url(f: RawFile, dest: Path) -> bool:
    tmp = dest.with_name(dest.name + ".part")
    try:
        req = urllib.request.Request(f.url, headers={"User-Agent": "four-lights-pipeline"})
        with urllib.request.urlopen(req, timeout=60) as r, tmp.open("wb") as out:
            shutil.copyfileobj(r, out, 8 << 20)
        tmp.replace(dest)
    except OSError as e:
        print(f"  download failed: {e}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False
    return _ok(dest, f)


def _from_cache(f: RawFile, dest: Path) -> bool:
    cache = os.environ.get("NASA_CACHE")
    if not cache:
        return False
    src = Path(cache) / f.rel
    if not _ok(src, f):
        print(f"  cache copy missing or SHA-256 mismatch: {src}", file=sys.stderr)
        return False
    dest.unlink(missing_ok=True)
    try:
        os.link(src, dest)  # same filesystem: no second copy of a 3.4 GB file
    except OSError:
        shutil.copy2(src, dest)
    return _ok(dest, f)


def fetch(files: list[RawFile], cache_first: bool) -> dict[str, str]:
    """Returns {rel: 'present' | 'nasa' | 'cache'}; raises if any file can't be had."""
    got: dict[str, str] = {}
    for f in files:
        dest = RAW_LOLA / f.rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if _ok(dest, f):
            got[f.rel] = "present"
            continue
        print(f"fetch {f.rel} ({f.size / 1e6:.0f} MB)", flush=True)
        order = [("cache", _from_cache), ("nasa", _from_url)]
        if not cache_first:
            order.reverse()
        for name, fn in order:
            if fn(f, dest):
                got[f.rel] = name
                break
        else:
            raise SystemExit(f"could not fetch {f.rel} from NASA or $NASA_CACHE")
    return got


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--site", help="PGDA site tile to include, e.g. Site04")
    p.add_argument("--all", action="store_true", help="every file in sources.FILES")
    p.add_argument("--cache-first", action="store_true")
    a = p.parse_args(argv)
    files = list(FILES.values()) if a.all else needed(a.site)
    for rel, how in fetch(files, a.cache_first).items():
        print(f"{how:8} {rel}")


if __name__ == "__main__":
    main()
