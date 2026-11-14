"""Fetch raw NASA files into data/raw/lola/, verifying size and SHA-256.

Default: download from the original NASA URL; on failure, take the file from $NASA_CACHE (the
offline mirror, for internet or cloud outages only) after checking its SHA-256. `--cache-first`
reverses the order. `--refresh` re-downloads from NASA even when a verified copy is present, and
replaces it only if the download matches the pinned SHA-256. Each file gets a `.source` sidecar
saying where it came from.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from four_lights.paths import RAW
from four_lights.sources import FILES, SPICE_FILES, USGS_FILES, RawFile, needed


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


def _mark(dest: Path, how: str, where: str) -> None:
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    dest.with_name(dest.name + ".source").write_text(f"{how} {where} {stamp}\n")


def source_of(dest: Path) -> str:
    """'nasa', 'cache' or 'unknown', from the sidecar written at fetch time."""
    side = dest.with_name(dest.name + ".source")
    return side.read_text().split()[0] if side.exists() else "unknown"


def _from_url(f: RawFile, dest: Path) -> bool:
    """Download to .part, check size and SHA-256, and only then replace `dest`."""
    tmp = dest.with_name(dest.name + ".part")
    h = hashlib.sha256()
    t0 = time.monotonic()
    got = 0
    try:
        req = urllib.request.Request(f.url, headers={"User-Agent": "four-lights-pipeline"})
        with urllib.request.urlopen(req, timeout=120) as r, tmp.open("wb") as out:
            next_report = 256 << 20
            while chunk := r.read(4 << 20):
                out.write(chunk)
                h.update(chunk)
                got += len(chunk)
                if got >= next_report:
                    rate = got / max(1e-3, time.monotonic() - t0) / 1e6
                    print(f"  {got / 1e6:.0f}/{f.size / 1e6:.0f} MB at {rate:.2f} MB/s", flush=True)
                    next_report += 256 << 20
    except OSError as e:
        print(f"  download failed: {e}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False
    if got != f.size or h.hexdigest() != f.sha256:
        print(
            f"  MISMATCH: {f.rel} from {f.url}: {got} bytes, sha256 {h.hexdigest()}",
            file=sys.stderr,
        )
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(dest)  # a new inode: a hard-linked mirror copy is left untouched
    dest.with_name(dest.name + ".sha256").write_text(f.sha256 + "\n")
    _mark(dest, "nasa", f.url)
    rate = got / max(1e-3, time.monotonic() - t0) / 1e6
    print(
        f"  verified {f.rel}: {got / 1e6:.0f} MB from the original source at {rate:.2f} MB/s",
        flush=True,
    )
    return True


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
    if not _ok(dest, f):
        return False
    _mark(dest, "cache", str(src))
    return True


def fetch(files: list[RawFile], cache_first: bool, refresh: bool = False) -> dict[str, str]:
    """Returns {rel: 'present (<source>)' | 'nasa' | 'cache'}; raises if any file can't be had.

    With `refresh`, files not already downloaded from NASA are fetched from NASA again; if NASA
    fails, the verified copy already present is kept and reported.
    """
    got: dict[str, str] = {}
    for f in sorted(files, key=lambda f: f.size) if refresh else files:
        dest = RAW / f.raw_subdir / f.raw_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        present = _ok(dest, f)
        if present and refresh and source_of(dest) != "nasa":
            print(f"refresh {f.rel} from NASA ({f.size / 1e6:.0f} MB)", flush=True)
            got[f.rel] = "nasa" if _from_url(f, dest) else f"present ({source_of(dest)})"
            continue
        if present:
            got[f.rel] = f"present ({source_of(dest)})"
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
    p.add_argument("--all", action="store_true", help="every LOLA file in sources.FILES")
    p.add_argument("--spice", action="store_true", help="the SPICE kernels")
    p.add_argument("--usgs", action="store_true", help="the USGS Artemis region grids")
    p.add_argument("--cache-first", action="store_true")
    p.add_argument("--refresh", action="store_true", help="re-download from NASA and verify")
    a = p.parse_args(argv)
    if a.spice:
        files = list(SPICE_FILES.values())
    elif a.usgs:
        files = list(USGS_FILES.values())
    else:
        files = list(FILES.values()) if a.all else needed(a.site)
    for rel, how in fetch(files, a.cache_first, a.refresh).items():
        print(f"{how:18} {rel}")


if __name__ == "__main__":
    main()
