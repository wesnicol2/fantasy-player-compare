# AGENTS.md — why this repo is shaped the way it is

`README.md` explains how to use and run the app. `CONTRIBUTING.md` owns the development/deployment process. `docs/mvp.md` is the product contract. This file records the architectural reasoning a future maintainer or agent should not have to re-derive.

## Which docs an agent may change

Keep `README.md` and `AGENTS.md` current with implementation changes. Do not change `CONTRIBUTING.md` or `docs/*.md` without explicit human approval: those are contracts the implementation is measured against.

## Local verification contract

After editing code, run:

```bash
bash scripts/fix
bash scripts/verify
```

`verify` is the exact local/CI gate: Ruff lint/format, tracked-Python compilation, pytest, Biome, strict TypeScript, pure share-URL tests, and a production Vite build. A deployed Test session is still required for behavior that depends on real credentials, upstream services, networking, containers, and the server's Watchtower deployment.

## The core idea

Fantasy Player Compare is deliberately one public decision surface, not a smaller copy of `odds-fantasy`: select two current offensive players and inspect what sportsbook markets imply about this week's fantasy output. A first-time visitor should get useful evidence without an account, league ID, roster import, or configuration workflow.

The public differentiator is the evidence model. The app exposes the weekly market-derived projection range, game environment, per-stat fantasy contribution, stat-value ranges, and probability distributions rather than adding generic rankings, consensus expert votes, ADP, or rest-of-season material.

## Architecture decisions

### Reuse the canonical projection engine; do not fork the math

`requirements.txt` pins `odds-fantasy` to an exact GitHub commit. `app/vendor.py` lazily bridges to its aggregator, market reconstruction, projection, graph-data, planner, Sleeper metadata, and weekly-window modules. This keeps one canonical implementation of the sportsbook reconstruction and missing-market semantics.

Do not copy those modules into this repo just to make them easier to edit. If the shared model needs a mathematical correction, fix and verify it in `odds-fantasy`, then deliberately advance the pinned commit here.

### Sleeper is identity metadata, not onboarding

Sleeper's public all-NFL-players endpoint supplies stable player IDs, full names, team abbreviations, and positions. There is no user/league/roster connection in this product. Search filters to current QB/RB/WR/TE players with a current team.

The upstream all-players response is expensive but stable, so the vendor client caches it for 24 hours. Do not turn search keystrokes into direct Sleeper calls.

### Scoring is three public presets

MVP scoring is Standard, Half-PPR, or PPR. `app/scoring.py` converts those presets into the same scoring-settings shape consumed by the shared projection engine. Custom league scoring is intentionally not part of the no-account MVP.

Changing the scoring preset must re-score cached sportsbook evidence; it must not create a different provider-data pipeline.

### Provider calls are game-shaped, not player-shaped

The Odds API player-prop endpoint is event-based. `app/service.py` therefore plans the two selected players together, takes the union of markets required for every selected player in each game, and fetches each game once. Two players in the same game share one cold event call; players in different games use one cold call per game.

Per-event locks coalesce identical concurrent misses. The stdlib server is threaded so this protection is meaningful under concurrent public traffic. On refresh failure, cached event evidence can be served with `stale=true`; no cached data means a controlled unavailable response, never a fabricated zero projection.

### Missing evidence remains unknown

The shared projection engine defines position-specific core markets. If a core market cannot be modeled, overall Floor/Median/Ceiling/Mean is withheld, `coverage.status` is partial/missing, and the missing markets are returned explicitly. Successfully modeled individual market evidence may still be shown.

Never replace a missing market or projection with `0`. Zero is a valid numeric football outcome; unknown is a data-quality state.

### One container, one page

React 19 + TypeScript owns the browser interaction. Vite builds it, ECharts renders only the probability drill-down, and ordinary CSS/semantic HTML handle everything else. There is no Zustand because the current app has only one coordinated page and local React state is sufficient.

The Python stdlib WSGI app serves both `/api/*` and the compiled frontend. Unknown non-API paths fall back to `index.html`, which is required for shareable `/compare/*` URLs. The URL carries stable Sleeper player IDs plus the scoring preset; slugs are descriptive only.

### Browser code presents; Python/model code decides

The browser may format numbers, compare displayed values for cell emphasis, map supplied percentiles onto a thermometer, and render backend graph points. It must not fit sportsbook lines, invent a projection, or independently reconstruct a stat distribution.

A stat-row click changes the displayed distribution. It does not trigger an alternate model.

## Deployment shape

The template's promotion contract remains unchanged:

- `dev/*` — CI only, no image publish.
- `feature/*` — publishes `ghcr.io/wesnicol2/fantasy-player-compare:test` for the shared Test container.
- `main` — publishes `:latest` for Production.

CI never reaches into the server. Watchtower pulls the moving tags. The Docker image exposes internal port 8000 and includes a cheap `/health` check.

## Things deliberately not done

- No account, login, user profile, saved comparisons, or personalized roster.
- No league import or custom scoring in MVP.
- No generic rankings, waiver tooling, ROS projections, ADP/draft stats, defenses, or kickers.
- No injury/news/weather aggregation.
- No advertisement code yet. The product should first prove that the two-player tool is useful and attracts traffic.
- No duplicated `odds-fantasy` projection engine.
- No frontend state framework while local React state remains sufficient.
- No server-side recommendation sentence beyond describing the displayed numeric comparison; the evidence is the product.
