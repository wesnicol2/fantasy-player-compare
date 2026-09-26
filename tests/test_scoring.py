import pytest

from app.scoring import scoring_rules


def test_scoring_presets_differ_only_by_receptions():
    standard = scoring_rules("standard")
    half = scoring_rules("half_ppr")
    ppr = scoring_rules("ppr")
    assert standard["rec"] == 0.0
    assert half["rec"] == 0.5
    assert ppr["rec"] == 1.0
    for key in set(standard) - {"rec"}:
        assert standard[key] == half[key] == ppr[key]


def test_unknown_scoring_preset_is_rejected():
    with pytest.raises(ValueError):
        scoring_rules("bonus-heavy")
