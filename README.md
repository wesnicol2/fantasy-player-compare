# Fantasy Player Compare

A tiny public fantasy-football tool for one decision: choose two current NFL players and compare what sportsbook markets imply about their fantasy output this week.

No account, league connection, roster setup, or rankings are required. The MVP supports QB/RB/WR/TE and Standard, Half-PPR, and PPR scoring.

## Use

1. Search for Player A and Player B.
2. Choose Standard, Half-PPR, or PPR scoring.
3. Compare Floor (P10), Median (P50), Ceiling (P90), Mean, matchup context, fantasy-point contributions, and stat distributions.
4. Click a shared stat to inspect its probability distribution.
5. Share or bookmark the generated `/compare/...` URL.

If a core sportsbook market is missing, the player is shown as **INCOMPLETE** and the missing markets are named. Unknown coverage is never represented as a zero-point projection.

## Data and model

- Sleeper's public NFL player directory supplies player identity, team, and position metadata only.
- The Odds API supplies current NFL event lines and player props.
- Projection mathematics come from the `odds-fantasy` package pinned to a specific source commit in `requirements.txt`; this service does not maintain a second copy of that model.
- Event responses are cached by the provider client. Identical concurrent event requests are coalesced, and cached evidence can be served as stale when a provider refresh fails.

The MVP contract and measurable acceptance criteria live in [`docs/mvp.md`](docs/mvp.md).

## Configuration

Copy `.env.example` to `.env` for local/container use. The application expects:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ODDS_API_KEY` | yes | — | The Odds API credential |
| `ODDS_TTL` | no | `43200` | NFL event-list cache horizon in seconds |
| `PLAYER_ODDS_TTL` | no | `900` | Player-prop event cache horizon in seconds |
| `SLEEPER_PLAYERS_TTL` | no | `86400` | Sleeper player-directory cache horizon in seconds |

The server deployment should inject secrets through the same environment-file convention used by the other home-server services. Do not bake credentials into the image.

## Run from source

```bash
pip install -r requirements.txt
pip install -e ".[dev]"
python -m app.api --host 0.0.0.0 --port 8000
```

For frontend development:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/health` to the Python service on port 8000.

## Verify

After edits:

```bash
bash scripts/fix
bash scripts/verify
```

`verify` is the same repository-owned gate used by CI. It runs Ruff lint/format, Python syntax checks, pytest, Biome, strict TypeScript, share-URL tests, and a production Vite build.

## Container

The production image is a multi-stage build: Node builds the React application, then the Python runtime serves the compiled UI and JSON API from one container on internal port `8000`. `/health` is the container liveness endpoint, and `/compare/*` falls back to the React `index.html` for shareable deep links.

CI publishes:

- `feature/*` → `ghcr.io/wesnicol2/fantasy-player-compare:test`
- `main` → `ghcr.io/wesnicol2/fantasy-player-compare:latest`

The server's Watchtower deployment pulls those tags; CI does not connect to the home server.

## Project structure

- `app/` — Python WSGI/static server, public scoring presets, provider orchestration, and response serialization.
- `frontend/` — React 19 + TypeScript + Vite + ECharts single-page comparison UI.
- `tests/` — provider-free Python unit tests.
- `frontend/test/` — small pure frontend contract tests.
- `docs/mvp.md` — MVP scope, acceptance criteria, and phase plan.
- `scripts/` — deterministic local/CI fix and verification commands.
- `CONTRIBUTING.md` — branching, CI/CD, and environment process contract.
- `AGENTS.md` — architecture reasoning and maintenance context.
