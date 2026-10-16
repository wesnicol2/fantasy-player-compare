"""Small public scoring presets for the no-account comparison product."""

from __future__ import annotations

SCORING_PRESETS: dict[str, dict[str, float]] = {
    "standard": {
        "pass_yd": 0.04,
        "pass_td": 4.0,
        "pass_int": -2.0,
        "rush_yd": 0.1,
        "rush_td": 6.0,
        "rec": 0.0,
        "rec_yd": 0.1,
        "rec_td": 6.0,
    },
    "half_ppr": {
        "pass_yd": 0.04,
        "pass_td": 4.0,
        "pass_int": -2.0,
        "rush_yd": 0.1,
        "rush_td": 6.0,
        "rec": 0.5,
        "rec_yd": 0.1,
        "rec_td": 6.0,
    },
    "ppr": {
        "pass_yd": 0.04,
        "pass_td": 4.0,
        "pass_int": -2.0,
        "rush_yd": 0.1,
        "rush_td": 6.0,
        "rec": 1.0,
        "rec_yd": 0.1,
        "rec_td": 6.0,
    },
}

DEFAULT_SCORING = "half_ppr"


def scoring_rules(name: str) -> dict[str, float]:
    """Return a defensive copy of one supported scoring preset."""
    try:
        return dict(SCORING_PRESETS[name])
    except KeyError as exc:
        supported = ", ".join(SCORING_PRESETS)
        raise ValueError(
            f"unsupported scoring preset {name!r}; expected one of {supported}"
        ) from exc
