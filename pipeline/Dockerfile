# The precompute in a container: build a landing site's data on any machine with Docker or Podman,
# with none of the Python, uv or Node setup. Build from the repository root:
#
#   docker build -f pipeline/Dockerfile -t fourlights-pipeline .
#
# Run it with ./ops/data-docker (same arguments as ./ops/data); pipeline/CONTEXT.md, "In a
# container", says what is mounted where.
#
# Node runs scripts/build-planner-summary.mjs, which uses the app's own rules to write planner.json;
# uv installs Python 3.14 and the pinned packages. rasterio's wheel carries its own GDAL, which
# needs the system's libexpat.
FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libexpat1 make \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    MPLBACKEND=Agg \
    MPLCONFIGDIR=/tmp/matplotlib \
    PYTHONUNBUFFERED=1

# The Python environment first, so a change to the code does not reinstall the packages.
COPY pipeline/pyproject.toml pipeline/requirements.lock pipeline/Makefile pipeline/
COPY pipeline/src pipeline/src
RUN make -C pipeline venv

# The rest of what a run reads or writes (.dockerignore keeps the image small). ops/data installs
# the Node packages when node_modules is missing; the planner summary needs none of them.
COPY . .
RUN mkdir -p node_modules data/raw data/derived stages/02_build/output/media

# data/ holds NASA's files (about 5 GB, downloaded and checksummed on the first run) and the
# intermediate results: keep it on a volume. The published files appear in web/public/data/.
VOLUME ["/app/data"]
ENTRYPOINT ["./ops/data"]
