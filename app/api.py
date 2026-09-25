"""Single-container WSGI API + React static-file server."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from collections.abc import Callable, Iterable
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs
from wsgiref.simple_server import WSGIServer, make_server

from .scoring import DEFAULT_SCORING
from .service import ComparisonError, compare_players, search_players

JSON_HEADERS = [("Content-Type", "application/json; charset=utf-8")]
UI_ROOT = Path(os.getenv("UI_ROOT", Path(__file__).resolve().parent.parent / "ui"))


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    """Handle public requests concurrently while keeping the stdlib runtime small."""

    daemon_threads = True


def health() -> dict[str, str]:
    return {"status": "ok"}


def _json(start_response: Callable, status: int, payload: object) -> Iterable[bytes]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    reasons = {
        200: "OK",
        400: "Bad Request",
        404: "Not Found",
        405: "Method Not Allowed",
        422: "Unprocessable Entity",
        500: "Internal Server Error",
        503: "Service Unavailable",
    }
    start_response(
        f"{status} {reasons.get(status, 'Error')}",
        [*JSON_HEADERS, ("Cache-Control", "no-store"), ("Content-Length", str(len(body)))],
    )
    return [body]


def _static(start_response: Callable, path: Path, head: bool = False) -> Iterable[bytes]:
    try:
        data = path.read_bytes()
    except OSError:
        return _json(start_response, 404, {"error": "not found"})
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = [
        ("Content-Type", content_type),
        ("Content-Length", str(len(data))),
        (
            "Cache-Control",
            "public, max-age=31536000, immutable" if "/assets/" in path.as_posix() else "no-cache",
        ),
    ]
    start_response("200 OK", headers)
    return [] if head else [data]


def _serve_ui(start_response: Callable, request_path: str, head: bool = False) -> Iterable[bytes]:
    relative = request_path.lstrip("/")
    candidate = (UI_ROOT / relative).resolve() if relative else UI_ROOT / "index.html"
    try:
        candidate.relative_to(UI_ROOT.resolve())
    except ValueError:
        return _json(start_response, 404, {"error": "not found"})
    if relative and candidate.is_file():
        return _static(start_response, candidate, head=head)
    return _static(start_response, UI_ROOT / "index.html", head=head)


def application(environ: dict, start_response: Callable) -> Iterable[bytes]:
    path = str(environ.get("PATH_INFO", "/"))
    method = str(environ.get("REQUEST_METHOD", "GET"))
    if method not in {"GET", "HEAD"}:
        return _json(start_response, 405, {"error": "method not allowed"})

    if path.rstrip("/") == "/health":
        return _json(start_response, 200, health())

    query = parse_qs(str(environ.get("QUERY_STRING", "")), keep_blank_values=True)
    if path.rstrip("/") == "/api/players":
        q = (query.get("q") or [""])[0]
        try:
            players = search_players(q)
        except ComparisonError as exc:
            return _json(start_response, exc.status, {"error": str(exc)})
        except Exception:
            return _json(start_response, 503, {"error": "player search is temporarily unavailable"})
        return _json(start_response, 200, {"players": players})

    if path.rstrip("/") == "/api/compare":
        left = (query.get("left") or [""])[0]
        right = (query.get("right") or [""])[0]
        scoring = (query.get("scoring") or [DEFAULT_SCORING])[0]
        if not left or not right:
            return _json(start_response, 400, {"error": "left and right player ids are required"})
        try:
            payload = compare_players(left, right, scoring)
        except ComparisonError as exc:
            return _json(start_response, exc.status, {"error": str(exc)})
        except Exception:
            return _json(start_response, 500, {"error": "comparison failed"})
        return _json(start_response, 200, payload)

    if path.startswith("/api/"):
        return _json(start_response, 404, {"error": "not found", "path": path})
    return _serve_ui(start_response, path, head=method == "HEAD")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Fantasy Player Compare.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)
    with make_server(args.host, args.port, application, server_class=ThreadingWSGIServer) as httpd:
        print(f"serving on http://{args.host}:{args.port}", flush=True)
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
