"""Site Review: a short AI-written paragraph per site, from our own numbers only.

    python -m four_lights.site_review [site ...]      ->  web/public/data/reviews.json

Written ahead of time (no live model call in the app). For each site we compute a small table of
facts from the published file (2 m observer, whole product period), give a language model those
facts and nothing else, and keep its paragraph only if every number in it is one of the facts.
The model runs on Cloudflare Workers AI through the `cf` CLI (needs `cf auth login`).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
from datetime import UTC, datetime

import numpy as np

from four_lights.paths import PUBLIC_DATA
from four_lights.validate import visible_fraction

MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
ACCOUNT_ID = "e3cb8bffb3a1a6e6009c50fdf0bc6b82"
HEIGHT_M = 2.0
COMMS_MARGIN_DEG = 1.0
MAX_WORDS = 110
ATTEMPTS = 4
OUT = PUBLIC_DATA / "reviews.json"

SYSTEM = (
    "You write one short factual paragraph about a candidate landing site near the Moon's south "
    "pole, for a mission planner. Use ONLY the facts given. Do not add any other number, name, "
    "history, mission or claim. Do not give advice or a recommendation. Plain English, no "
    "headings, no lists, no markdown, at most 90 words. Write numbers exactly as given, with "
    "their units. Begin the paragraph with the site's name, exactly as given, and what stands "
    "out about it compared with the other sites (its ranks), then give the key figures: "
    "sunlight, longest night, Earth visibility and communications. Mention it if the terrain "
    "data is approximate."
)


def longest_run(mask: np.ndarray) -> int:
    best = run = 0
    for v in mask:
        run = run + 1 if v else 0
        best = max(best, run)
    return best


def facts_for(summary: dict, d: dict) -> tuple[dict[str, str], dict[str, float]]:
    """(facts shown to the model, raw metrics for ranking the sites against each other)."""
    h = next(p for p in d["horizons"] if p["height_m"] == HEIGHT_M)
    terrain = np.asarray(h["elev_deg"])

    def under(az: list[float]) -> np.ndarray:
        a = np.asarray(az)
        return terrain[(np.floor((a % 360) / h["step_deg"]).astype(int)) % terrain.size]

    sun_share = visible_fraction(np.asarray(d["sun"]["el"]) - under(d["sun"]["az"]))
    sun = sun_share > 0
    earth_clear = np.asarray(d["earth"]["el"]) - under(d["earth"]["az"])
    comms = earth_clear >= COMMS_MARGIN_DEG
    if "stations" in d:
        comms &= np.asarray(d["stations"]) > 0
    lat = abs(summary["lat"])
    lon = summary["lon_e"]
    ground = d["site"]["elev_m"]
    finest = d["meta"]["dem_rings"][0]
    metrics = {
        "sunlit": float(sun_share.mean()),
        "night": longest_run(~sun) / 24,
        "comms": float(comms.mean()),
    }
    return {
        "name": summary["name"],
        "position": f"{lat:.2f}°S, {abs(lon):.1f}°{'E' if lon >= 0 else 'W'}",
        "ground height": f"{ground:.0f} m relative to the Moon's reference sphere",
        "period analysed": "2028 and 2029, hourly, observer 2 m above the ground",
        "sunlit": f"{sun_share.mean() * 100:.0f}% of the time",
        "longest night": f"{longest_run(~sun) / 24:.1f} days",
        "longest unbroken sunlight": f"{longest_run(sun) / 24:.0f} days",
        "Earth above the terrain": f"{(earth_clear > 0).mean() * 100:.0f}% of the time",
        "communications possible": f"{comms.mean() * 100:.0f}% of the time",
        "highest terrain on the horizon": f"{terrain.max():.1f}° above level",
        "terrain data under the site": (
            f"{finest['res_m']:g} m per pixel LOLA elevation model"
            + (" (approximate: no 5 m data here)" if summary["approx"] else "")
        ),
    }, metrics


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def add_ranks(
    all_facts: dict[str, dict[str, str]], all_metrics: dict[str, dict[str, float]]
) -> None:
    """Add each site's standing among the sites: most sunlight, shortest night, most comms."""
    n = len(all_metrics)
    for key, label, best_is_high in (
        ("sunlit", "rank for sunlight among the sites", True),
        ("night", "rank for shortest longest night among the sites", False),
        ("comms", "rank for communications among the sites", True),
    ):
        order = sorted(all_metrics, key=lambda s: all_metrics[s][key], reverse=best_is_high)
        for i, sid in enumerate(order, start=1):
            all_facts[sid][label] = f"{ordinal(i)} of {n} (1st is best)"


def numbers(text: str) -> set[str]:
    """Numbers in a text, normalised (thousands separators removed, trailing .0 kept as is)."""
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def check(text: str, facts: dict[str, str]) -> str | None:
    """None if the paragraph passes; otherwise the reason it fails."""
    allowed = numbers(" ".join(facts.values()))
    extra = numbers(text) - allowed
    if extra:
        return f"numbers not in the facts: {sorted(extra)}"
    if len(text.split()) > MAX_WORDS:
        return f"{len(text.split())} words"
    if "\n" in text.strip() or "*" in text or "#" in text:
        return "not a single plain paragraph"
    if facts["name"] not in text:
        return "site name missing"
    # Words the number check can't see: "approximate" only where the facts say so.
    says_approx = bool(re.search(r"approximat|rough|coarse|estimate", text, flags=re.I))
    if says_approx and "approximate" not in facts["terrain data under the site"]:
        return "calls the terrain data approximate when it is not"
    return None


def ask(facts: dict[str, str]) -> str:
    body = {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": "Facts:\n" + "\n".join(f"- {k}: {v}" for k, v in facts.items()),
            },
        ],
        "max_tokens": 300,
        "temperature": 0.4,
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(body, f)
        path = f.name
    try:
        out = subprocess.run(
            ["cf", "ai", "run", MODEL, "--body", f"@{path}"],
            check=True,
            capture_output=True,
            text=True,
            env={**os.environ, "CLOUDFLARE_ACCOUNT_ID": ACCOUNT_ID},
        ).stdout
    finally:
        os.unlink(path)
    return json.loads(out)["choices"][0]["message"]["content"].strip()


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("sites", nargs="*")
    a = p.parse_args(argv)
    index = json.loads((PUBLIC_DATA / "sites.json").read_text())
    existing = json.loads(OUT.read_text()) if OUT.exists() else {"sites": {}}
    reviews: dict[str, dict] = existing.get("sites", {})
    failed = []
    all_facts: dict[str, dict[str, str]] = {}
    all_metrics: dict[str, dict[str, float]] = {}
    for s in index:
        d = json.loads((PUBLIC_DATA / "sites" / f"{s['id']}.json").read_text())
        all_facts[s["id"]], all_metrics[s["id"]] = facts_for(s, d)
    add_ranks(all_facts, all_metrics)
    for s in index:
        if a.sites and s["id"] not in a.sites:
            continue
        facts = all_facts[s["id"]]
        for attempt in range(1, ATTEMPTS + 1):
            text = ask(facts)
            why = check(text, facts)
            if why is None:
                reviews[s["id"]] = {"text": text, "facts": facts}
                print(f"{s['id']}: ok (attempt {attempt}): {text}\n", flush=True)
                break
            print(f"{s['id']}: rejected ({why})", flush=True)
        else:
            failed.append(s["id"])
            reviews.pop(s["id"], None)
    OUT.write_text(
        json.dumps(
            {
                "model": MODEL,
                "provider": "Cloudflare Workers AI",
                "generated_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "note": "AI-written from the facts listed with each review; every number in a "
                "review is checked against those facts.",
                "sites": reviews,
            },
            indent=1,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"wrote {OUT}: {len(reviews)} reviews" + (f"; FAILED: {failed}" if failed else ""))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
