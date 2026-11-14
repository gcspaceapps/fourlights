"""Run every site end to end: horizon -> ephemerides -> publish.

    python -m four_lights.run_sites               # all 12, one at a time
    python -m four_lights.run_sites --jobs 2      # in parallel (each run peaks near 1.6 GB)
    python -m four_lights.run_sites haworth slater-plain

A site whose PGDA tile isn't downloaded yet is moved to the back of the queue and waited for.
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import time
import traceback

from four_lights import publish, run_ephem, run_horizon
from four_lights.paths import RAW_LOLA
from four_lights.sites import SITES
from four_lights.sources import site_tile

WAIT_S = 30
MAX_WAIT_S = 3 * 3600


def _ready(site_id: str) -> bool:
    spec = SITES[site_id]
    if not spec.pgda_site:
        return True
    tile = RAW_LOLA / site_tile(spec.pgda_site)
    side = tile.with_name(tile.name + ".sha256")
    return tile.exists() and side.exists()


def one(site_id: str) -> tuple[str, bool, float]:
    t0 = time.monotonic()
    try:
        run_horizon.run(site_id)
        run_ephem.run(site_id)
        publish.publish(site_id)
        return site_id, True, time.monotonic() - t0
    except (Exception, SystemExit):
        traceback.print_exc()
        return site_id, False, time.monotonic() - t0


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("sites", nargs="*", default=list(SITES))
    p.add_argument("--jobs", type=int, default=1)
    a = p.parse_args(argv)
    queue = [s for s in a.sites if s in SITES]
    unknown = sorted(set(a.sites) - set(SITES))
    if unknown:
        raise SystemExit(f"unknown sites: {unknown}")
    results: list[tuple[str, bool, float]] = []
    waited = 0
    with mp.get_context("spawn").Pool(a.jobs) as pool:
        while queue:
            ready = [s for s in queue if _ready(s)]
            if not ready:
                if waited > MAX_WAIT_S:
                    raise SystemExit(f"gave up waiting for tiles: {queue}")
                print(f"waiting for tiles: {queue}", flush=True)
                time.sleep(WAIT_S)
                waited += WAIT_S
                continue
            queue = [s for s in queue if s not in ready]
            results += pool.map(one, ready, chunksize=1)
    print("\nsummary:")
    for sid, ok, dt in results:
        print(f"  {'ok  ' if ok else 'FAIL'} {sid:22} {dt:5.0f} s")
    if not all(ok for _, ok, _ in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
