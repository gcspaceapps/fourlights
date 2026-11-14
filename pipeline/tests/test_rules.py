"""The pipeline's copies of the app's rules, and the checks on what it publishes."""

import json

import numpy as np
import pytest

from four_lights.paths import PUBLIC_DATA
from four_lights.publish import _site_file, _summary
from four_lights.scenario import hourly_flags, verdict, window
from four_lights.site_review import check, numbers, ordinal
from four_lights.validate import longest_run, visible_fraction


def test_disc_fraction_matches_the_app() -> None:
    # Same values as web/tests/lights.test.ts (SUN_RADIUS_DEG = 0.2666).
    r = 0.2666
    f = visible_fraction(np.array([-1.0, -r, 0.0, r / 2, r, 1.0]))
    assert f[0] == 0 and f[1] == 0 and f[4] == 1 and f[5] == 1
    assert f[2] == pytest.approx(0.5)
    assert f[3] == pytest.approx(0.8045, abs=1e-4)


def test_longest_run() -> None:
    assert longest_run(np.array([1, 1, 0, 1, 1, 1, 0], dtype=bool)) == 3
    assert longest_run(np.zeros(4, dtype=bool)) == 0


def test_window_and_verdict() -> None:
    sun = np.array([1.0] * 100 + [0.0] * 49 + [0.5] * 19)  # 168 h
    comms = np.array([True] * 168)
    lit, dark, usable = window(sun, comms, 0, 168)
    assert lit == pytest.approx((100 + 9.5) / 168)
    assert dark == 49
    assert usable == round((100 + 9.5) / 24, 1)
    assert verdict(0.9, 48, 3.5, 7) == "green"
    assert verdict(0.9, 48, 3.4, 7) == "amber"
    assert verdict(0.9, 49, 7.0, 7) == "red"  # one hour too dark
    assert verdict(0.69, 0, 7.0, 7) == "red"  # not enough sunlight


PLANNER = PUBLIC_DATA / "planner.json"


@pytest.mark.skipif(not PLANNER.exists(), reason="needs the published data")
def test_python_rules_agree_with_the_apps_planner_summary() -> None:
    """scenario.py re-implements web/src/lights.ts. The published planner.json was made by the
    TypeScript rules, so comparing against it checks the two implementations against each other,
    for every site and every landing day (7-day windows)."""
    published = json.loads(PLANNER.read_text())["windows"]["7"]
    index = json.loads((PUBLIC_DATA / "sites.json").read_text())
    codes = {"green": "g", "amber": "a", "red": "r"}
    cells = differing_verdicts = 0
    for s in index:
        d = json.loads((PUBLIC_DATA / "sites" / f"{s['id']}.json").read_text())
        sun, comms = hourly_flags(d)
        row = published[s["id"]]
        for day in range(len(row["u"])):
            lit, dark, usable = window(sun, comms, day * 24, 168)
            cells += 1
            assert dark == row["d"][day], (s["id"], day)
            # The two languages round exact halves differently: allow one unit in the last place.
            assert abs(round(usable * 10) - row["u"][day]) <= 1, (s["id"], day)
            assert abs(lit * 100 - row["s"][day]) <= 0.5 + 1e-6, (s["id"], day)
            if codes[verdict(lit, dark, usable, 7)] != row["v"][day]:
                differing_verdicts += 1
    assert cells > 8000
    # A verdict can only differ where a value sits exactly on a threshold and rounds two ways.
    assert differing_verdicts <= cells * 0.001, f"{differing_verdicts} of {cells} verdicts differ"


def _hz() -> dict:
    return {
        "id": "x",
        "name": "X",
        "source": "test",
        "point_rule": "rule (1.00, 2.00) km",
        "ps_x_m": 1000.0,
        "ps_y_m": 2000.0,
        "site": {"lat": -89.0, "lon_e": 10.0, "elev_m": 100.0},
        "ground_source": {"source": "LDEM_75S_60M", "res_m": 60.0},
        "horizons": [
            {"height_m": h, "step_deg": 0.5, "elev_deg": [0.123] * 720} for h in (1.0, 2.0, 5.0)
        ],
        "meta": {"dem_rings": [{"source": "A", "res_m": 5.0, "max_km": 10.0, "extra": 1}]},
    }


def _ep(n: int = 4) -> dict:
    track = {"az": [10.12345] * n, "el": [-0.98765] * n}
    block = {
        "start_utc": "2028-01-01T00:00:00Z",
        "step_min": 60,
        "n": n,
        "sun": track,
        "earth": track,
    }
    return {"product": block, "validation": block, "meta": {"ephem": "Horizons DE441"}}


def test_published_site_file_follows_the_data_contract() -> None:
    out = _site_file(_hz(), _ep(), "product")
    assert set(out) == {"id", "site", "horizons", "times", "sun", "earth", "meta"}
    assert out["times"] == {"start_utc": "2028-01-01T00:00:00Z", "step_min": 60, "n": 4}
    assert [h["height_m"] for h in out["horizons"]] == [1.0, 2.0, 5.0]
    assert all(len(h["elev_deg"]) == 720 and h["step_deg"] == 0.5 for h in out["horizons"])
    assert out["sun"]["az"] == [10.12] * 4 and out["earth"]["el"] == [-0.99] * 4  # 0.01° rounding
    assert out["meta"]["dem_rings"] == [{"source": "A", "res_m": 5.0, "max_km": 10.0}]
    assert out["meta"]["frame"] == "MOON_ME" and out["meta"]["ephem"] == "Horizons DE441"


def test_validation_file_keeps_only_the_heights_asked_for() -> None:
    out = _site_file(_hz(), _ep(), "validation", heights=[1.0, 5.0])
    assert [h["height_m"] for h in out["horizons"]] == [1.0, 5.0]


def test_site_summary_marks_sites_without_5m_terrain_as_approximate() -> None:
    hz = _hz()
    assert _summary(hz)["approx"] is True  # 60 m under the site
    hz["ground_source"] = {"source": "PGDA", "res_m": 5.0}
    s = _summary(hz)
    assert s["approx"] is False
    assert set(s) == {
        "id",
        "name",
        "lat",
        "lon_e",
        "ps_x_m",
        "ps_y_m",
        "source",
        "point_rule",
        "approx",
    }


FACTS = {
    "name": "Test Ridge",
    "sunlit": "84% of the time",
    "longest night": "5.7 days",
    "rank for sunlight among the sites": "3rd of 12 (1st is best)",
    "terrain data under the site": "5 m per pixel LOLA elevation model",
}


def test_review_checker_accepts_a_faithful_paragraph() -> None:
    assert (
        check("Test Ridge ranks 3rd of 12 for sunlight: 84% sunlit, longest night 5.7 days.", FACTS)
        is None
    )


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("Test Ridge is sunlit 85% of the time.", "numbers not in the facts"),
        ("Test Ridge has a 5.7 day night and sits 1200 m up.", "numbers not in the facts"),
        ("This site is sunlit 84% of the time.", "site name missing"),
        ("Test Ridge is sunlit 84% of the time, from approximate terrain data.", "approximate"),
        ("Test Ridge is sunlit 84%.\n\nIt is nice.", "single plain paragraph"),
        ("Test Ridge " + "word " * 120, "words"),
    ],
)
def test_review_checker_rejects(text: str, reason: str) -> None:
    why = check(text, FACTS)
    assert why is not None and reason in why


def test_review_checker_allows_approximate_when_the_facts_say_so() -> None:
    facts = {
        **FACTS,
        "terrain data under the site": "60 m per pixel (approximate: no 5 m data here)",
    }
    assert (
        check("Test Ridge is sunlit 84% of the time, from approximate 60 m terrain data.", facts)
        is None
    )


def test_numbers_and_ordinals() -> None:
    assert numbers("84% and 5.7 days, 1,739 m") == {"84", "5.7", "1739"}
    assert [ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22)] == [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
    ]
