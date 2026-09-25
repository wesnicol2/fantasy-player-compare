from __future__ import annotations

import json
from io import BytesIO

from app import api


def request(path="/health", query="", method="GET"):
    status = None
    headers = None

    def start_response(value, values):
        nonlocal status, headers
        status = value
        headers = values

    body = b"".join(
        api.application(
            {
                "PATH_INFO": path,
                "QUERY_STRING": query,
                "REQUEST_METHOD": method,
                "wsgi.input": BytesIO(),
            },
            start_response,
        )
    )
    return status, dict(headers or []), body


def test_health_is_cheap_json():
    status, headers, body = request()
    assert status == "200 OK"
    assert headers["Content-Type"].startswith("application/json")
    assert json.loads(body) == {"status": "ok"}


def test_compare_requires_two_ids():
    status, _, body = request("/api/compare", "left=1")
    assert status == "400 Bad Request"
    assert "required" in json.loads(body)["error"]


def test_unknown_api_route_is_json_404():
    status, _, body = request("/api/nope")
    assert status == "404 Not Found"
    assert json.loads(body)["error"] == "not found"


def test_player_search_upstream_failure_is_controlled_503(monkeypatch):
    def fail(_query):
        raise api.ComparisonError("player directory is temporarily unavailable", 503)

    monkeypatch.setattr(api, "search_players", fail)
    status, _, body = request("/api/players", "q=alpha")
    assert status == "503 Service Unavailable"
    assert json.loads(body)["error"] == "player directory is temporarily unavailable"
