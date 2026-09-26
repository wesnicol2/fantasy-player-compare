"""Application service layer for two-player weekly comparisons."""

from __future__ import annotations

import datetime as dt
import re
import threading
import time
from collections.abc import Mapping
from statistics import median
from typing import Any

from .scoring import DEFAULT_SCORING, SCORING_PRESETS, scoring_rules
from .vendor import VendorModules, load_vendor

SUPPORTED_POSITIONS = {"QB", "RB", "WR", "TE"}
PLAYER_SEARCH_LIMIT = 12
_EVENTS_LOCK = threading.Lock()
_PLAYERS_LOCK = threading.Lock()
_EVENT_LOCKS_GUARD = threading.Lock()
_EVENT_LOCKS: dict[str, threading.Lock] = {}


class ComparisonError(RuntimeError):
    """Controlled user-facing comparison failure."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _norm(value: str) -> str:
    value = (value or "").lower()
    value = re.sub(r"[\.'`-]", " ", value)
    value = re.sub(r"[^a-z0-9 ]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def _player_record(
    player_id: str,
    raw: Mapping[str, Any],
    vendor: VendorModules,
) -> dict[str, Any] | None:
    position = str(raw.get("position") or "").upper()
    team = str(raw.get("team") or "").upper()
    name = str(raw.get("full_name") or "").strip()
    if position not in SUPPORTED_POSITIONS or not team or not name:
        return None
    team_name = vendor.config.SLEEPER_TO_ODDSAPI_TEAM.get(team)
    if not team_name:
        return None
    return {
        "id": str(player_id),
        "name": name,
        "position": position,
        "team": team,
        "team_name": team_name,
    }


def _all_players(vendor: VendorModules) -> Mapping[str, Any]:
    try:
        with _PLAYERS_LOCK:
            return vendor.sleeper_api.get_players() or {}
    except Exception as exc:
        raise ComparisonError("player directory is temporarily unavailable", 503) from exc


def player_catalog(vendor: VendorModules | None = None) -> list[dict[str, Any]]:
    vendor = vendor or load_vendor()
    rows = [
        record
        for player_id, raw in _all_players(vendor).items()
        if (record := _player_record(str(player_id), raw or {}, vendor)) is not None
    ]
    rows.sort(key=lambda row: (row["name"].lower(), row["id"]))
    return rows


def search_players(
    query: str,
    limit: int = PLAYER_SEARCH_LIMIT,
    vendor: VendorModules | None = None,
) -> list[dict[str, Any]]:
    needle = _norm(query)
    if not needle:
        return []
    matches: list[tuple[int, str, dict[str, Any]]] = []
    for row in player_catalog(vendor):
        haystack = _norm(row["name"])
        if needle not in haystack:
            continue
        rank = 0 if haystack == needle else 1 if haystack.startswith(needle) else 2
        matches.append((rank, haystack, row))
    matches.sort(key=lambda item: (item[0], item[1], item[2]["id"]))
    return [item[2] for item in matches[: max(1, min(int(limit), 25))]]


def _player_by_id(player_id: str, vendor: VendorModules) -> dict[str, Any]:
    raw = _all_players(vendor).get(str(player_id))
    if not raw:
        raise ComparisonError(f"unknown player id: {player_id}", 404)
    record = _player_record(str(player_id), raw, vendor)
    if record is None:
        raise ComparisonError("player is not a current supported QB/RB/WR/TE", 422)
    return record


def _event_lock(key: str) -> threading.Lock:
    with _EVENT_LOCKS_GUARD:
        return _EVENT_LOCKS.setdefault(key, threading.Lock())


def _cached_timestamp(
    vendor: VendorModules,
    event_id: str,
    markets: str,
    region: str,
) -> int | None:
    try:
        url = (
            f"{vendor.config.EVENTS_URL}/{event_id}/odds?apiKey={vendor.config.API_KEY}"
            f"&regions={region}&markets={markets}"
        )
        return int(vendor.odds_client._load_meta().get(url) or 0) or None
    except Exception:
        return None


def _event_odds(
    vendor: VendorModules,
    event_id: str,
    markets: list[str],
    region: str = "us",
) -> tuple[object, int | None, bool]:
    market_string = ",".join(sorted(set(markets)))
    lock_key = f"{event_id}|{region}|{market_string}"
    with _event_lock(lock_key):
        try:
            payload = vendor.odds_client.get_event_player_odds(
                event_id=event_id,
                regions=region,
                markets=market_string,
                mode="auto",
            )
            timestamp = _cached_timestamp(vendor, event_id, market_string, region)
            return payload, timestamp or int(time.time()), False
        except Exception as exc:
            try:
                cached = vendor.odds_client.get_event_player_odds(
                    event_id=event_id,
                    regions=region,
                    markets=market_string,
                    mode="cache",
                )
            except Exception:
                cached = None
            if cached:
                return cached, _cached_timestamp(vendor, event_id, market_string, region), True
            raise ComparisonError("sportsbook data is temporarily unavailable", 503) from exc


def _line_rows(by_book: Mapping[str, Any], market_key: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for book_key, markets in by_book.items():
        main = (markets or {}).get(market_key)
        if isinstance(main, dict):
            over = main.get("over") or {}
            under = main.get("under") or {}
            if over or under:
                rows.append(
                    {
                        "book": book_key,
                        "source": "main",
                        "point": over.get("point")
                        if over.get("point") is not None
                        else under.get("point"),
                        "over_odds": over.get("odds"),
                        "under_odds": under.get("odds"),
                    }
                )
        alternate = (markets or {}).get(f"{market_key}_alternate")
        alts = alternate.get("alts") if isinstance(alternate, dict) else None
        if not isinstance(alts, dict):
            continue
        by_point: dict[float, dict[str, Any]] = {}
        for side in ("over", "under"):
            for item in alts.get(side) or []:
                try:
                    point = float(item.get("point"))
                except (TypeError, ValueError):
                    continue
                row = by_point.setdefault(
                    point,
                    {
                        "book": book_key,
                        "source": "alternate",
                        "point": point,
                        "over_odds": None,
                        "under_odds": None,
                    },
                )
                row[f"{side}_odds"] = item.get("odds")
        rows.extend(by_point.values())
    rows.sort(key=lambda row: (float(row.get("point") or 0), str(row.get("book") or "")))
    return rows


def _game_line_context(event_odds: object, team: str) -> dict[str, Any]:
    events = [event_odds] if isinstance(event_odds, dict) else list(event_odds or [])
    totals: list[float] = []
    spreads: list[float] = []
    implied: list[float] = []
    books: set[str] = set()
    for event in events:
        if not isinstance(event, dict):
            continue
        for book in event.get("bookmakers", []) or []:
            game_total = None
            team_spread = None
            for market in book.get("markets", []) or []:
                if market.get("key") == "totals":
                    over = next(
                        (o for o in market.get("outcomes", []) or [] if o.get("name") == "Over"),
                        None,
                    )
                    game_total = over.get("point") if over else None
                elif market.get("key") == "spreads":
                    outcome = next(
                        (o for o in market.get("outcomes", []) or [] if o.get("name") == team),
                        None,
                    )
                    team_spread = outcome.get("point") if outcome else None
            try:
                total = float(game_total) if game_total is not None else None
                spread = float(team_spread) if team_spread is not None else None
            except (TypeError, ValueError):
                continue
            if total is not None:
                totals.append(total)
            if spread is not None:
                spreads.append(spread)
            if total is not None and spread is not None:
                implied.append((total - spread) / 2.0)
            if total is not None or spread is not None:
                books.add(str(book.get("key") or book.get("title") or "unknown"))
    return {
        "game_total": round(median(totals), 2) if totals else None,
        "team_spread": round(median(spreads), 2) if spreads else None,
        "team_implied_total": round(median(implied), 2) if implied else None,
        "books_used": len(books),
    }


def _serialize_player(
    player: dict[str, Any],
    by_book: Mapping[str, Any],
    projection: Any,
    game: Any | None,
    event_payload: object | None,
    vendor: VendorModules,
    evidence_ts: int | None,
    stale: bool,
) -> dict[str, Any]:
    markets: dict[str, Any] = {}
    for market_key, stat in projection.stats.items():
        anchors = vendor.market_math.collect_anchors(by_book, market_key)
        markets[market_key] = {
            "stat_range": [round(float(value), 2) for value in stat.stat_range],
            "stat_mean": round(float(stat.mean), 2),
            "expected_points": round(float(stat.expected_points), 3),
            "graph": vendor.graph_data.distribution_graph(stat.distribution, market_key),
            "anchors": [
                {
                    "threshold": round(float(anchor.threshold), 2),
                    "survival": round(float(anchor.survival), 4),
                }
                for anchor in anchors
            ],
            "lines": _line_rows(by_book, market_key),
        }

    combined_markets: dict[str, Any] = {}
    combined_range = vendor.projection.combined_stat_range(projection.stats)
    if combined_range is not None:
        sources = [
            key for key in vendor.projection.COMBINED_YARDAGE_MARKETS if key in projection.stats
        ]
        combined_markets[vendor.projection.COMBINED_YARDAGE_KEY] = {
            "markets": sources,
            "stat_range": [round(float(value), 2) for value in combined_range],
            "stat_mean": round(sum(projection.stats[key].mean for key in sources), 2),
            "expected_points": round(
                sum(projection.stats[key].expected_points for key in sources), 3
            ),
        }

    matchup = None
    if game is not None:
        is_home = player["team_name"] == game.home_team
        matchup = {
            "opponent": game.away_team if is_home else game.home_team,
            "venue": "home" if is_home else "away",
            "commence_time": game.commence_time,
            **(_game_line_context(event_payload, player["team_name"]) if event_payload else {}),
        }

    complete = bool(projection.has_projection)
    return {
        "player": player,
        "coverage": {
            "status": "complete" if complete else "partial" if projection.stats else "missing",
            "required_markets": list(projection.required_markets),
            "missing_markets": list(projection.missing_markets),
        },
        "projection": {
            "floor": round(float(projection.floor), 2),
            "mid": round(float(projection.mid), 2),
            "ceiling": round(float(projection.ceiling), 2),
            "mean": round(float(projection.mean), 2),
            "curve": vendor.projection.survival_curve(projection.samples),
        }
        if complete
        else None,
        "matchup": matchup,
        "markets": markets,
        "combined_markets": combined_markets,
        "evidence": {
            "as_of": dt.datetime.fromtimestamp(evidence_ts, dt.UTC)
            .isoformat()
            .replace("+00:00", "Z")
            if evidence_ts
            else None,
            "stale": bool(stale),
        },
    }


def compare_players(
    left_id: str,
    right_id: str,
    scoring: str = DEFAULT_SCORING,
    vendor: VendorModules | None = None,
) -> dict[str, Any]:
    if str(left_id) == str(right_id):
        raise ComparisonError("choose two different players", 422)
    if scoring not in SCORING_PRESETS:
        raise ComparisonError("unsupported scoring preset", 422)

    vendor = vendor or load_vendor()
    left = _player_by_id(str(left_id), vendor)
    right = _player_by_id(str(right_id), vendor)
    try:
        with _EVENTS_LOCK:
            events = vendor.odds_client.get_nfl_events(regions="us", mode="auto")
    except Exception as exc:
        try:
            events = vendor.odds_client.get_nfl_events(regions="us", mode="cache")
        except Exception:
            events = []
        if not events:
            raise ComparisonError("NFL event data is temporarily unavailable", 503) from exc

    windows = vendor.weekly_windows.resolve_week_windows(events)
    if windows is None:
        raise ComparisonError("no NFL games are currently available to compare", 503)

    roster = {
        "players": {
            player["id"]: {
                "editorial_team_full_name": player["team_name"],
                "primary_position": player["position"],
                "name": {"full": player["name"]},
            }
            for player in (left, right)
        }
    }
    planned = vendor.planner.plan_relevant_games_and_markets(
        roster,
        windows,
        regions="us",
        cache_mode="auto",
        events=events,
    )["this"]

    event_payloads: dict[str, object] = {}
    freshness: dict[str, tuple[int | None, bool]] = {}
    for event_id, game in planned.items():
        payload, timestamp, stale = _event_odds(
            vendor,
            event_id,
            [*game.markets, "spreads", "totals"],
        )
        event_payloads[event_id] = payload
        freshness[event_id] = (timestamp, stale)

    players_odds = vendor.aggregator.aggregate_by_week(event_payloads, planned)
    rules = scoring_rules(scoring)

    def build(player: dict[str, Any]) -> dict[str, Any]:
        alias = vendor.planner.player_alias(player["name"])
        by_book = players_odds.get(alias, {})
        projection = vendor.projection.project_player(
            by_book,
            rules,
            position=player["position"],
        )
        game = next(
            (
                value
                for value in planned.values()
                if any(item.get("alias") == alias for item in value.players)
            ),
            None,
        )
        timestamp, stale = freshness.get(game.game_id, (None, False)) if game else (None, False)
        payload = event_payloads.get(game.game_id) if game else None
        return _serialize_player(
            player,
            by_book,
            projection,
            game,
            payload,
            vendor,
            timestamp,
            stale,
        )

    return {
        "scoring": scoring,
        "generated_at": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z"),
        "left": build(left),
        "right": build(right),
    }
