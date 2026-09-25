import { useEffect, useMemo, useState } from 'react';
import { comparePlayers } from './api/client';
import { ComparisonView } from './components/ComparisonView';
import { PlayerSearch } from './components/PlayerSearch';
import {
  comparisonUrl,
  parseSharedPath,
  scoringFromSearch,
} from './comparisonUrl';
import type { ComparisonResponse, PlayerOption, ScoringPreset } from './types';

const SCORING: Array<{ value: ScoringPreset; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'half_ppr', label: 'Half-PPR' },
  { value: 'ppr', label: 'PPR' },
];

export function App() {
  const shared = useMemo(
    () => parseSharedPath(window.location.pathname),
    [],
  );
  const [left, setLeft] = useState<PlayerOption | null>(null);
  const [right, setRight] = useState<PlayerOption | null>(null);
  const [scoring, setScoring] = useState<ScoringPreset>(() =>
    scoringFromSearch(window.location.search),
  );
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [sharedIds, setSharedIds] = useState(shared);
  const [loading, setLoading] = useState(Boolean(shared));
  const [error, setError] = useState<string | null>(null);

  const leftId = left?.id ?? sharedIds?.left ?? null;
  const rightId = right?.id ?? sharedIds?.right ?? null;

  useEffect(() => {
    if (!leftId || !rightId) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void comparePlayers(leftId, rightId, scoring, controller.signal)
      .then((response) => {
        setData(response);
        setLeft(response.left.player);
        setRight(response.right.player);
        setSharedIds(null);
        window.history.replaceState(
          null,
          '',
          comparisonUrl(response.left.player, response.right.player, scoring),
        );
        document.title = `${response.left.player.name} vs ${response.right.player.name} | Fantasy Player Compare`;
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return;
        setError(
          reason instanceof Error ? reason.message : 'Comparison unavailable',
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [leftId, rightId, scoring]);

  const setLeftPlayer = (player: PlayerOption | null) => {
    setSharedIds(null);
    setLeft(player);
    setData(null);
    setError(null);
    if (!player || !right) window.history.replaceState(null, '', '/');
  };

  const setRightPlayer = (player: PlayerOption | null) => {
    setSharedIds(null);
    setRight(player);
    setData(null);
    setError(null);
    if (!player || !left) window.history.replaceState(null, '', '/');
  };

  const swap = () => {
    if (!left || !right) return;
    setLeft(right);
    setRight(left);
    setData(null);
  };

  return (
    <main>
      <header className="site-header">
        <a href="/" className="brand">
          Fantasy Player Compare
        </a>
        <span className="site-tagline">Vegas-derived weekly evidence</span>
      </header>

      <section className="hero">
        <p className="eyebrow">No rankings. No account. This week only.</p>
        <h1>Which player does the betting market like?</h1>
        <p>
          Pick two players. Compare their fantasy range, game environment, and
          the props driving the projection.
        </p>
      </section>

      <section
        className="compare-controls"
        aria-label="Choose players and scoring"
      >
        <PlayerSearch
          label="Player A"
          selected={left}
          excludeId={right?.id}
          onSelect={setLeftPlayer}
        />
        <button
          className="swap-button"
          type="button"
          onClick={swap}
          disabled={!left || !right}
          aria-label="Swap players"
        >
          ⇄
        </button>
        <PlayerSearch
          label="Player B"
          selected={right}
          excludeId={left?.id}
          onSelect={setRightPlayer}
        />
        <fieldset className="scoring-control">
          <legend>Scoring</legend>
          <div>
            {SCORING.map((option) => (
              <button
                key={option.value}
                type="button"
                className={scoring === option.value ? 'active' : undefined}
                aria-pressed={scoring === option.value}
                onClick={() => setScoring(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {!leftId || !rightId ? (
        <section className="empty-state">
          <strong>Select two players to compare.</strong>
          <span>QB, RB, WR, and TE are supported.</span>
        </section>
      ) : null}
      {loading ? (
        <section className="loading-state" aria-live="polite">
          Loading market evidence…
        </section>
      ) : null}
      {error ? (
        <section className="error-state" role="alert">
          <strong>Comparison unavailable</strong>
          <span>{error}</span>
        </section>
      ) : null}
      {!loading && !error && data ? <ComparisonView data={data} /> : null}

      <footer>
        Projections are derived from sportsbook markets and are estimates, not
        guarantees.
      </footer>
    </main>
  );
}
