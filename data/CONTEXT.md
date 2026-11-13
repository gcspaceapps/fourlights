# data/

Raw downloads only, in `data/raw/` (gitignored): LOLA DEMs, Horizons responses, SPICE kernels, USGS region grids, each fetched by `pipeline/` from the original NASA/USGS URLs, or copied from the offline mirror at `$NASA_CACHE` if a URL fails (checked against its `MANIFEST.tsv` SHA-256). Nothing here is edited by hand. Published results go to `web/public/data/`, never here.
