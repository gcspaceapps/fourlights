# Data manifest

Every pipeline run, newest last. Times AEST. One row per output file.

| Time | Machine | Command | Inputs (source, SHA-256 short) | Output | Size | Run time |
|---|---|---|---|---|---|---|
| Sat 09:58 | redback (x86_64) | `python -m four_lights.run_horizon shackleton-rim` | Site04_final_adj_5mpp_surf.tif 38ff70db; ldem_87s_5mpp.tif 417a8571; LDEM_875S_20M.IMG dc16bba8; LDEM_75S_60M.IMG d6d65d69; LDEM_75S_240M.IMG d031efe2 | `data/derived/horizons/shackleton-rim.json` | 25 kB | 110 s |
| Sat 09:58 | redback (x86_64) | `python -m four_lights.run_horizon shackleton-rim` | Site04_final_adj_5mpp_surf.tif 38ff70db; ldem_87s_5mpp.tif 417a8571; LDEM_875S_20M.IMG dc16bba8; LDEM_75S_60M.IMG d6d65d69; LDEM_75S_240M.IMG d031efe2 | `stages/02_build/output/media/skyline-shackleton-rim.png` | 82 kB | 110 s |

Note, Sat 09:40: raw files for the run above came from `$NASA_CACHE` via `make fetch FETCH_FLAGS=--cache-first` (every file's SHA-256 checked against `pipeline/src/four_lights/sources.py`). PGDA serves about 0.5 MB/s, so the 3.4 GB 87S mosaic would take about 2 h from the original URL. A plain `make fetch` downloads from NASA.
| Sat 10:13 | redback (x86_64) | `python -m four_lights.run_ephem shackleton-rim` | naif0012.tls 678e32bd; pck00011.tpc 3dff7b1d; moon_pa_de440_200625.bpc 60cd55aa; moon_de440_250416.tf a47c71e9; de440s.bsp c1c7feea; Horizons API (DE441), SPICE check | `data/derived/ephem/shackleton-rim.json` | 645 kB | 3 s |
| Sat 10:13 | redback (x86_64) | `python -m four_lights.publish shackleton-rim` | derived horizons + ephem for shackleton-rim | `web/public/data/sites/shackleton-rim.json` | 440 kB | 0 s |
| Sat 10:13 | redback (x86_64) | `python -m four_lights.publish shackleton-rim` | derived horizons + ephem for shackleton-rim | `web/public/data/validation/photo-2026-11-14/shackleton-rim.json` | 19 kB | 0 s |
| Sat 10:13 | redback (x86_64) | `python -m four_lights.publish shackleton-rim` | derived horizons + ephem for shackleton-rim | `web/public/data/sites.json` | 1 kB | 0 s |
