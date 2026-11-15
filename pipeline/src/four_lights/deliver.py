"""Send a finished site file back to the app that asked for it.

    RESULT_URL=https://.../api/pipeline/<project>/<site> RESULT_TOKEN=... \\
        python -m four_lights.deliver <site-id>
    ... python -m four_lights.deliver <site-id> --failed

Used by ops/site-job, which a hosted machine runs for one site added to a shared project
(pipeline/CONTEXT.md, "On Fly.io"). The file is the one `publish` wrote, with the site's line from
sites.json added as `index` so the app knows whether the terrain under it is approximate.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request

from four_lights.paths import PUBLIC_DATA


def payload(site_id: str) -> bytes:
    site = json.loads((PUBLIC_DATA / "sites" / f"{site_id}.json").read_text())
    index = json.loads((PUBLIC_DATA / "sites.json").read_text())
    site["index"] = next((s for s in index if s["id"] == site_id), None)
    return json.dumps(site, separators=(",", ":")).encode()


def send(url: str, token: str, body: bytes | None, *, method: str) -> int:
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            # Cloudflare turns away the default "Python-urllib" client (error 1010) before the
            # request reaches the app, so the sender says who it is.
            "User-Agent": "fourlights-pipeline/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status
    except urllib.error.HTTPError as e:
        return e.code


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site")
    p.add_argument("--failed", action="store_true", help="report that the run did not finish")
    a = p.parse_args(argv)
    url, token = os.environ.get("RESULT_URL"), os.environ.get("RESULT_TOKEN")
    if not url or not token:
        raise SystemExit("RESULT_URL and RESULT_TOKEN must be set")
    if a.failed:
        status = send(f"{url}/failed", token, b"{}", method="POST")
    else:
        status = send(url, token, payload(a.site), method="PUT")
    print(f"{'reported failure' if a.failed else 'sent ' + a.site}: HTTP {status}")
    if status >= 300:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
