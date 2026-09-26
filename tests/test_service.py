from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from types import SimpleNamespace

import pytest

from app import service


class FakeSleeper:
    def get_players(self):
        return {
            "1": {"full_name": "Alpha Receiver", "position": "WR", "team": "ARI"},
            "2": {"full_name": "Beta Back", "position": "RB", "team": "ATL"},
            "3": {"full_name": "Retired Guy", "position": "WR", "team": None},
            "4": {"full_name": "Gamma Kicker", "position": "K", "team": "ARI"},
        }


@dataclass
class FakeGame:
    game_id: str
    home_team: str
    away_team: str
    commence_time: str
    players: list[dict]
    markets: list[str]


class FakeOddsClient:
    def __init__(self, stale=False):
        self.event_calls = 0
        self.stale = stale
        self.cache = {}

    def get_nfl_events(self, regions="us", mode="auto"):
        return [
            {
                "id": "g1",
                "home_team": "Arizona Cardinals",
                "away_team": "Atlanta Falcons",
                "commence_time": "2026-09-27T20:00:00Z",
            }
        ]

    def get_event_player_odds(self, event_id, regions="us", markets="", mode="auto"):
        key = (event_id, regions, markets)
        if mode == "auto":
            if self.stale:
                raise RuntimeError("provider down")
            if key in self.cache:
                return self.cache[key]
            self.event_calls += 1
            time.sleep(0.02)
        payload = {
            "id": event_id,
            "bookmakers": [
                {
                    "key": "book",
                    "markets": [
                        {"key": "totals", "outcomes": [{"name": "Over", "point": 48.0}]},
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": "Arizona Cardinals", "point": -2.0},
                                {"name": "Atlanta Falcons", "point": 2.0},
                            ],
                        },
                    ],
                }
            ],
        }
        if mode == "auto":
            self.cache[key] = payload
        return payload

    @staticmethod
    def _load_meta():
        return {}


class FakePlanner:
    @staticmethod
    def player_alias(name):
        return name

    @staticmethod
    def plan_relevant_games_and_markets(
        roster,
        windows,
        regions="us",
        cache_mode="auto",
        events=None,
    ):
        players = [
            {"alias": raw["name"]["full"], "primary_position": raw["primary_position"]}
            for raw in roster["players"].values()
        ]
        game = FakeGame(
            "g1",
            "Arizona Cardinals",
            "Atlanta Falcons",
            "2026-09-27T20:00:00Z",
            players,
            ["player_reception_yds", "player_rush_yds", "player_anytime_td"],
        )
        return {"this": {"g1": game}, "next": {}}


class FakePlannerDifferentGames(FakePlanner):
    @staticmethod
    def plan_relevant_games_and_markets(
        roster,
        windows,
        regions="us",
        cache_mode="auto",
        events=None,
    ):
        raw_players = list(roster["players"].values())
        alpha = raw_players[0]
        beta = raw_players[1]
        game_one = FakeGame(
            "g1",
            "Arizona Cardinals",
            "Carolina Panthers",
            "2026-09-27T17:00:00Z",
            [
                {
                    "alias": alpha["name"]["full"],
                    "primary_position": alpha["primary_position"],
                }
            ],
            ["player_reception_yds", "player_anytime_td"],
        )
        game_two = FakeGame(
            "g2",
            "Atlanta Falcons",
            "Chicago Bears",
            "2026-09-27T20:00:00Z",
            [
                {
                    "alias": beta["name"]["full"],
                    "primary_position": beta["primary_position"],
                }
            ],
            ["player_rush_yds", "player_anytime_td"],
        )
        return {"this": {"g1": game_one, "g2": game_two}, "next": {}}


class FakeAggregator:
    @staticmethod
    def aggregate_by_week(event_payloads, planned):
        return {"Alpha Receiver": {"book": {}}, "Beta Back": {"book": {}}}


class FakeGraph:
    @staticmethod
    def distribution_graph(distribution, market_key):
        return {"kind": "continuous_density", "points": [{"x": 1.0, "probability": 0.5}]}


class FakeMarketMath:
    @staticmethod
    def collect_anchors(by_book, market_key):
        return []


class FakeProjection:
    COMBINED_YARDAGE_MARKETS = ("player_rush_yds", "player_reception_yds")
    COMBINED_YARDAGE_KEY = "rush_reception_yds"

    @staticmethod
    def project_player(by_book, rules, position=None):
        key = "player_reception_yds" if position == "WR" else "player_rush_yds"
        stat = SimpleNamespace(
            stat_range=(30.0, 60.0, 90.0),
            mean=62.0,
            expected_points=6.2,
            distribution=object(),
        )
        return SimpleNamespace(
            floor=7.0,
            mid=12.0 if position == "WR" else 11.0,
            ceiling=20.0,
            mean=12.5,
            stats={key: stat},
            samples=[7.0, 12.0, 20.0],
            required_markets=(key,),
            missing_markets=(),
            has_projection=True,
        )

    @staticmethod
    def survival_curve(samples):
        return [{"x": 12.0, "survival": 0.5}]

    @staticmethod
    def combined_stat_range(stats):
        return (30.0, 60.0, 90.0) if stats else None


class FakeIncompleteProjection(FakeProjection):
    @staticmethod
    def project_player(by_book, rules, position=None):
        complete = FakeProjection.project_player(by_book, rules, position=position)
        complete.required_markets = ("player_reception_yds", "player_anytime_td")
        complete.missing_markets = ("player_anytime_td",)
        complete.has_projection = False
        return complete


class FakeWindows:
    @staticmethod
    def resolve_week_windows(events):
        return ((object(), object()), (object(), object()))


def fake_vendor(stale=False, incomplete=False):
    return SimpleNamespace(
        sleeper_api=FakeSleeper(),
        config=SimpleNamespace(
            SLEEPER_TO_ODDSAPI_TEAM={"ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons"},
            EVENTS_URL="https://example.test/events",
            API_KEY="test",
        ),
        odds_client=FakeOddsClient(stale=stale),
        planner=FakePlanner(),
        aggregator=FakeAggregator(),
        projection=FakeIncompleteProjection() if incomplete else FakeProjection(),
        graph_data=FakeGraph(),
        market_math=FakeMarketMath(),
        weekly_windows=FakeWindows(),
    )


def test_search_filters_positions_and_team():
    vendor = fake_vendor()
    assert [row["name"] for row in service.search_players("alp", vendor=vendor)] == [
        "Alpha Receiver"
    ]
    assert service.search_players("kicker", vendor=vendor) == []
    assert service.search_players("retired", vendor=vendor) == []


def test_compare_rejects_same_player_before_provider_work():
    with pytest.raises(service.ComparisonError) as exc:
        service.compare_players("1", "1", vendor=fake_vendor())
    assert exc.value.status == 422


def test_same_game_fetches_event_once_and_serializes_matchup():
    vendor = fake_vendor()
    payload = service.compare_players("1", "2", "half_ppr", vendor=vendor)
    assert vendor.odds_client.event_calls == 1
    assert payload["left"]["projection"]["mid"] == 12.0
    assert payload["right"]["projection"]["mid"] == 11.0
    assert payload["left"]["matchup"]["team_implied_total"] == 25.0
    assert payload["right"]["matchup"]["team_implied_total"] == 23.0


def test_different_games_fetch_each_game_once():
    vendor = fake_vendor()
    vendor.planner = FakePlannerDifferentGames()
    payload = service.compare_players("1", "2", vendor=vendor)
    assert vendor.odds_client.event_calls == 2
    assert payload["left"]["player"]["id"] == "1"
    assert payload["right"]["player"]["id"] == "2"


def test_provider_failure_uses_cached_event_and_marks_stale():
    payload = service.compare_players("1", "2", "ppr", vendor=fake_vendor(stale=True))
    assert payload["left"]["evidence"]["stale"] is True
    assert payload["right"]["evidence"]["stale"] is True


def test_invalid_scoring_is_rejected_before_upstream_work():
    with pytest.raises(service.ComparisonError) as exc:
        service.compare_players("1", "2", "bonus", vendor=fake_vendor())
    assert exc.value.status == 422


def test_incomplete_projection_is_unknown_not_zero():
    payload = service.compare_players("1", "2", vendor=fake_vendor(incomplete=True))
    assert payload["left"]["projection"] is None
    assert payload["left"]["coverage"]["status"] == "partial"
    assert payload["left"]["coverage"]["missing_markets"] == ["player_anytime_td"]
    assert payload["left"]["markets"]


def test_concurrent_identical_event_requests_coalesce_provider_fetch():
    vendor = fake_vendor()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(
            pool.map(
                lambda _: service._event_odds(
                    vendor,
                    "g-coalesce",
                    ["player_reception_yds", "spreads", "totals"],
                ),
                range(8),
            )
        )
    assert vendor.odds_client.event_calls == 1
    assert all(result[2] is False for result in results)
