# Fantasy Player Compare — MVP contract

## Product goal

A first-time visitor can compare any two current NFL QB/RB/WR/TE players for the current fantasy week without creating an account, connecting a league, or configuring a roster. The product explains the comparison through betting-market-derived fantasy projections rather than expert rankings or a black-box score.

The default task is intentionally one sentence: **pick two players and compare what betting markets imply about them this week.**

## In scope

- Public, no-account player search using Sleeper's public NFL player directory for identity/team/position metadata only.
- Exactly two selected players.
- Standard, Half-PPR, and PPR scoring presets.
- Current NFL fantasy week; fall forward to the next real NFL slate when no current-week events exist.
- Betting-market-derived Floor (P10), Median (P50), Ceiling (P90), Mean, matchup context, and market-by-market expected fantasy-point/stat-value evidence.
- Cross-position comparisons among QB/RB/WR/TE, including combined rushing+receiving yardage for RB-vs-WR/TE yardage comparisons.
- Clickable stat rows that reveal the canonical fitted distribution for that stat.
- Explicit incomplete/missing-market states. Missing sportsbook coverage is unknown, never zero.
- Shareable comparison URLs and basic page metadata.
- Event-level provider caching, request coalescing, and stale-on-provider-error fallback so anonymous traffic does not scale Odds API calls linearly with page views.

## Explicitly out of scope

Accounts, Sleeper league/roster connection, custom league scoring, lineup optimization, generic rankings, waiver tools, ROS projections, ADP/draft data, defenses, kickers, historical performance, injury/news aggregation, weather, ads, subscriptions, user profiles, saved comparisons, AI-generated recommendations, and a CMS/content site.

## Scoring presets

All presets use 0.04 points per passing yard, 4 per passing TD, -2 per interception, 0.1 per rushing yard, 6 per rushing TD, 0.1 per receiving yard, and 6 per receiving TD. Receptions are worth 0 / 0.5 / 1.0 in Standard / Half-PPR / PPR respectively. No yardage bonuses are included in MVP presets.

## Acceptance criteria

| ID | Area | Acceptance criterion |
| --- | --- | --- |
| AC-01 | Entry | `/` loads a usable comparison page without login, cookies, league ID, roster ID, or onboarding. |
| AC-02 | Player search | Each selector searches the current Sleeper NFL player directory by name and returns only QB/RB/WR/TE players with a current NFL team. Results show name, position, and team. |
| AC-03 | Selection | A visitor can select two different players entirely with mouse/touch or keyboard. Selecting the same player twice is prevented with a clear inline state. |
| AC-04 | Scoring | Standard, Half-PPR, and PPR are selectable. Half-PPR is the initial default. Changing scoring recomputes fantasy points from the same sportsbook evidence and does not require a fresh provider fetch while that evidence is cached. |
| AC-05 | Projection | A complete player shows Floor=P10, Median=P50, Ceiling=P90, and Mean from the canonical sportsbook-derived fantasy-point distribution. |
| AC-06 | Matchup | Each player shows opponent, home/away, kickoff, game total, team spread, and team implied total when available; unavailable game-line fields render as `—`, not `0`. |
| AC-07 | Point evidence | The comparison shows each modeled market's expected fantasy-point contribution and orders meaningful rows consistently for both players. |
| AC-08 | Stat evidence | Each comparable market shows stat Floor/Median/Ceiling on a shared zero-anchored range for the pair. RB-vs-WR/TE comparisons combine rushing+receiving yardage rather than treating the position-specific yardage market names as an automatic mismatch. |
| AC-09 | Distribution drill-down | Activating a comparable stat row reveals both players' backend-derived display distribution when both sides have that stat. Continuous stats use density, high-granularity counts use PMF, and low-granularity counts use threshold probability semantics inherited from the canonical model. |
| AC-10 | Missing coverage | If any core market required by the player's position/scoring preset cannot be modeled, that player's overall projection is `INCOMPLETE`, missing markets are named, and no overall fantasy number is shown as 0. Successfully modeled individual evidence may still be displayed. |
| AC-11 | Cross-position | Any supported offensive position can be compared with any other supported offensive position without UI or API failure. Non-comparable market rows use `—` rather than declaring a winner. |
| AC-12 | Transparency | Cell emphasis is derived from the displayed numeric gap. Negative stats such as interceptions treat a larger number as worse. Color is never the only indication available to assistive technology. |
| AC-13 | URL | A completed comparison updates to a stable `/compare/...` URL containing both stable Sleeper player IDs and the scoring preset. Opening that URL reconstructs the same selection without local state. |
| AC-14 | Swap/new comparison | The visitor can swap Player A/Player B and replace either player without navigating away or resetting the other selection/scoring choice. |
| AC-15 | Responsive | At 360 CSS px wide, selectors, scoring control, summary, table, and drill-down remain usable without horizontal page scrolling. The evidence table may use a deliberate compact/mobile layout rather than shrinking desktop text. |
| AC-16 | Accessibility | Inputs have visible labels, combobox results are keyboard-operable, focus is visible, semantic table/heading structure is used, and interactive stat rows are actual buttons/controls. |
| AC-17 | Provider efficiency | Comparing two players in the same NFL game causes at most one event-odds provider fetch for the union of required markets on a cold cache. Players in different games cause at most one cold provider fetch per game. |
| AC-18 | Cache reuse | Repeating the same event+market request inside `PLAYER_ODDS_TTL` uses cache. Concurrent identical cold requests are coalesced so only one reaches the provider. |
| AC-19 | Failure fallback | If provider refresh fails but cached event data exists, the comparison can use the cached payload and labels it stale. If no usable payload exists, the UI shows data unavailable instead of an empty/zero comparison. |
| AC-20 | Freshness | The comparison response reports an evidence timestamp and whether it is fresh/stale; the UI renders that state without claiming data is newer than it is. |
| AC-21 | Player-directory efficiency | Sleeper's all-players payload is cached for 24 hours and is not fetched on every search keystroke/page view. |
| AC-22 | Health | `GET /health` returns HTTP 200 and a small `{status:"ok"}` payload without contacting Sleeper or The Odds API. |
| AC-23 | API validation | Unknown player IDs, unsupported positions, identical players, and invalid scoring values return deterministic 4xx JSON errors; upstream failures are translated to controlled 5xx/503 JSON errors without stack traces. |
| AC-24 | Tests | Unit tests cover scoring presets, player filtering/search, event planning, missing coverage, response serialization, cache/coalescing behavior, URL parsing/serialization helpers, and WSGI routing. No test requires live provider credentials. |
| AC-25 | Frontend verification | CI runs Biome, strict TypeScript typecheck, and a production Vite build in addition to the template's Python Ruff/format/syntax/pytest gate. |
| AC-26 | Container | The production image builds the React app, serves it and the API from one container on internal port 8000, and serves `index.html` as the fallback for `/compare/*`. |
| AC-27 | Deployment | Template promotion is preserved: `dev/*` is CI-only, the single MVP `feature/*` publishes `:test`, and `main` publishes `:latest`. No deployment secret or server access is added to GitHub Actions. |
| AC-28 | Scope discipline | The shipped page has no dashboard/nav shell, league setup, rankings, roster import, account creation, advertisements, or unrelated analytics cards. |

## Phase plan

| Phase | Development branch | Deliverable | Exit condition |
| --- | --- | --- | --- |
| 0 — Contract/bootstrap | `dev/mvp-contract-bootstrap` | Product contract, frontend build skeleton, and CI Node verification | CI green with the template service plus production frontend build |
| 1 — Comparison backend | `dev/comparison-backend` | Player directory/search, scoring presets, current-week planning, odds aggregation, canonical projection serialization, matchup context, caching/coalescing, missing-data semantics, one-container runtime | Backend acceptance/unit tests green with fake upstreams |
| 2 — Comparison frontend | `dev/comparison-frontend` | Two accessible selectors, scoring control, comparison matrix, range thermometers, stat drill-down chart, responsive layout, URL state | Production frontend build/typecheck green and the API contract is wired end-to-end |
| 3 — Hardening | `dev/mvp-hardening` | Stale fallback/freshness, error UX, metadata/shareability, final test coverage and docs cleanup | All ACs demonstrably met except live-provider/Test verification |
| 4 — Test promotion | merges above into `feature/mvp-player-compare` only | `:test` image deployed by existing Watchtower infrastructure | One real Test session verifies player search, same-game and cross-game comparison, scoring switch, incomplete-lines behavior, mobile layout; then feature→main PR is ready |
