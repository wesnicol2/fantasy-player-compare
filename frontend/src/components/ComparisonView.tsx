import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type {
  ComparisonResponse,
  MarketDetail,
  PlayerComparisonSide,
} from '../types';
import { DistributionChart } from './DistributionChart';
import { RangeThermometer } from './RangeThermometer';

const LABELS: Record<string, string> = {
  player_pass_yds: 'Passing yards',
  player_pass_tds: 'Passing TDs',
  player_pass_interceptions: 'Interceptions',
  player_rush_yds: 'Rushing yards',
  player_receptions: 'Receptions',
  player_reception_yds: 'Receiving yards',
  player_anytime_td: 'Anytime TD',
  rush_reception_yds: 'Rush + receiving yards',
};

const YARDAGE = new Set(['player_rush_yds', 'player_reception_yds']);

function marketLabel(key: string) {
  return LABELS[key] ?? key.replace(/^player_/, '').replaceAll('_', ' ');
}

function fmt(value: number | null | undefined, digits = 1) {
  return value == null ? '—' : value.toFixed(digits);
}

function fmtSigned(value: number | null | undefined, suffix = '') {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
}

function fmtKickoff(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function crossYardageRoles(left: string, right: string) {
  const back = (position: string) => position === 'RB';
  const catcher = (position: string) => position === 'WR' || position === 'TE';
  return (back(left) && catcher(right)) || (back(right) && catcher(left));
}

interface Measure {
  points: number;
  statMean: number;
  range: [number, number, number];
  detail: MarketDetail | null;
}

function measure(side: PlayerComparisonSide, key: string): Measure | null {
  if (key === 'rush_reception_yds') {
    const combined = side.combined_markets[key];
    if (!combined) return null;
    return {
      points: combined.expected_points,
      statMean: combined.stat_mean,
      range: combined.stat_range,
      detail: null,
    };
  }
  const detail = side.markets[key];
  if (!detail) return null;
  return {
    points: detail.expected_points,
    statMean: detail.stat_mean,
    range: detail.stat_range,
    detail,
  };
}

function Cell({ children, edge }: { children: ReactNode; edge?: boolean }) {
  return (
    <td className={edge ? 'edge-cell' : undefined}>
      {children}
      {edge ? <span className="sr-only"> Edge</span> : null}
    </td>
  );
}

function ProjectionHeader({ side }: { side: PlayerComparisonSide }) {
  const matchup = side.matchup;
  return (
    <div className="player-heading">
      <strong>{side.player.name}</strong>
      <span className="player-heading-meta">
        {side.player.position} · {side.player.team}
      </span>
      <span className="player-heading-meta player-heading-matchup">
        {matchup
          ? `${matchup.venue === 'home' ? 'vs' : '@'} ${matchup.opponent}`
          : 'Matchup unavailable'}
      </span>
    </div>
  );
}

function CoverageNotice({ side }: { side: PlayerComparisonSide }) {
  if (side.coverage.status === 'complete') return null;
  return (
    <div className="coverage-warning">
      <strong>INCOMPLETE</strong>
      <span>
        {side.coverage.missing_markets.length
          ? `Missing ${side.coverage.missing_markets.map(marketLabel).join(', ')}`
          : 'No usable core lines'}
      </span>
    </div>
  );
}

export function ComparisonView({ data }: { data: ComparisonResponse }) {
  const { left, right } = data;
  const mergeYardage = crossYardageRoles(
    left.player.position,
    right.player.position,
  );
  const keys = useMemo(() => {
    const union = new Set([
      ...Object.keys(left.markets),
      ...Object.keys(right.markets),
    ]);
    let result = [...union];
    if (mergeYardage && result.some((key) => YARDAGE.has(key))) {
      result = [
        'rush_reception_yds',
        ...result.filter((key) => !YARDAGE.has(key)),
      ];
    }
    const impact = (key: string) =>
      Math.max(
        Math.abs(measure(left, key)?.points ?? 0),
        Math.abs(measure(right, key)?.points ?? 0),
      );
    return result.sort((a, b) => impact(b) - impact(a));
  }, [left, mergeYardage, right]);

  const drillable = keys.filter(
    (key) => left.markets[key]?.graph && right.markets[key]?.graph,
  );
  const [metric, setMetric] = useState<string | null>(drillable[0] ?? null);
  const activeMetric =
    metric && drillable.includes(metric) ? metric : (drillable[0] ?? null);
  const lp = left.projection;
  const rp = right.projection;
  const medianDelta = lp && rp ? lp.mid - rp.mid : null;
  const evidenceDates = [left.evidence.as_of, right.evidence.as_of].filter(
    Boolean,
  ) as string[];
  const oldestEvidence = evidenceDates.length
    ? new Date(
        Math.min(...evidenceDates.map((value) => new Date(value).getTime())),
      )
    : null;
  const stale = left.evidence.stale || right.evidence.stale;

  const projectionRows: Array<
    [string, number | undefined, number | undefined]
  > = [
    ['Floor', lp?.floor, rp?.floor],
    ['Median', lp?.mid, rp?.mid],
    ['Ceiling', lp?.ceiling, rp?.ceiling],
    ['Mean', lp?.mean, rp?.mean],
  ];

  return (
    <section className="comparison" aria-live="polite">
      <header className="comparison-summary">
        <div>
          <p className="eyebrow">
            This week · {data.scoring.replace('_', ' ')}
          </p>
          <h2>
            {medianDelta == null
              ? 'Projection incomplete'
              : Math.abs(medianDelta) < 0.05
                ? 'Median projections are essentially tied'
                : `${medianDelta > 0 ? left.player.name : right.player.name} +${Math.abs(medianDelta).toFixed(1)} FP at median`}
          </h2>
        </div>
        <div className={stale ? 'freshness stale' : 'freshness'}>
          {oldestEvidence
            ? `${stale ? 'Cached evidence' : 'Evidence'} ${oldestEvidence.toLocaleString(
                [],
                {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                },
              )}`
            : 'Evidence time unavailable'}
        </div>
      </header>

      <div className="coverage-grid">
        <CoverageNotice side={left} />
        <CoverageNotice side={right} />
      </div>

      <section className="matrix-section">
        <h3>Projection</h3>
        <div className="table-scroll">
          <table aria-label="Weekly player projection comparison">
            <thead>
              <tr>
                <th scope="col">Signal</th>
                <th scope="col">
                  <ProjectionHeader side={left} />
                </th>
                <th scope="col">
                  <ProjectionHeader side={right} />
                </th>
              </tr>
            </thead>
            <tbody>
              {projectionRows.map(([label, leftValue, rightValue]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <Cell
                    edge={
                      leftValue != null &&
                      rightValue != null &&
                      leftValue > rightValue
                    }
                  >
                    {leftValue == null ? '—' : `${fmt(leftValue)} FP`}
                  </Cell>
                  <Cell
                    edge={
                      leftValue != null &&
                      rightValue != null &&
                      rightValue > leftValue
                    }
                  >
                    {rightValue == null ? '—' : `${fmt(rightValue)} FP`}
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="matrix-section">
        <h3>Game environment</h3>
        <div className="table-scroll">
          <table aria-label="Weekly matchup comparison">
            <thead>
              <tr>
                <th scope="col">Signal</th>
                <th scope="col">{left.player.name}</th>
                <th scope="col">{right.player.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Team implied total</th>
                <td>
                  {left.matchup?.team_implied_total == null
                    ? '—'
                    : `${fmt(left.matchup.team_implied_total)} pts`}
                </td>
                <td>
                  {right.matchup?.team_implied_total == null
                    ? '—'
                    : `${fmt(right.matchup.team_implied_total)} pts`}
                </td>
              </tr>
              <tr>
                <th scope="row">Game total</th>
                <td>
                  {left.matchup?.game_total == null
                    ? '—'
                    : `${fmt(left.matchup.game_total)} pts`}
                </td>
                <td>
                  {right.matchup?.game_total == null
                    ? '—'
                    : `${fmt(right.matchup.game_total)} pts`}
                </td>
              </tr>
              <tr>
                <th scope="row">Team spread</th>
                <td>{fmtSigned(left.matchup?.team_spread)}</td>
                <td>{fmtSigned(right.matchup?.team_spread)}</td>
              </tr>
              <tr>
                <th scope="row">Kickoff</th>
                <td>{fmtKickoff(left.matchup?.commence_time)}</td>
                <td>{fmtKickoff(right.matchup?.commence_time)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="matrix-section">
        <h3>Where the fantasy points come from</h3>
        <div className="table-scroll">
          <table aria-label="Fantasy point contribution comparison">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">{left.player.name}</th>
                <th scope="col">{right.player.name}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const leftMeasure = measure(left, key);
                const rightMeasure = measure(right, key);
                return (
                  <tr key={key}>
                    <th scope="row">{marketLabel(key)}</th>
                    <Cell
                      edge={Boolean(
                        leftMeasure &&
                          rightMeasure &&
                          leftMeasure.points > rightMeasure.points,
                      )}
                    >
                      {leftMeasure ? fmtSigned(leftMeasure.points, ' FP') : '—'}
                    </Cell>
                    <Cell
                      edge={Boolean(
                        leftMeasure &&
                          rightMeasure &&
                          rightMeasure.points > leftMeasure.points,
                      )}
                    >
                      {rightMeasure
                        ? fmtSigned(rightMeasure.points, ' FP')
                        : '—'}
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="matrix-section">
        <h3>What the market expects</h3>
        <div className="table-scroll">
          <table aria-label="Stat value comparison">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">{left.player.name}</th>
                <th scope="col">{right.player.name}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const leftMeasure = measure(left, key);
                const rightMeasure = measure(right, key);
                const max = Math.max(
                  leftMeasure?.range[2] ?? 0,
                  rightMeasure?.range[2] ?? 0,
                  1,
                );
                const clickable =
                  key !== 'rush_reception_yds' &&
                  Boolean(left.markets[key] && right.markets[key]);
                return (
                  <tr key={key}>
                    <th scope="row">
                      {clickable ? (
                        <button
                          type="button"
                          className={
                            activeMetric === key
                              ? 'metric-button active'
                              : 'metric-button'
                          }
                          onClick={() => setMetric(key)}
                        >
                          {marketLabel(key)}
                        </button>
                      ) : (
                        marketLabel(key)
                      )}
                    </th>
                    <td>
                      <span className="stat-mean">
                        {leftMeasure ? fmt(leftMeasure.statMean) : '—'}
                      </span>
                      <RangeThermometer
                        range={leftMeasure?.range ?? null}
                        max={max}
                      />
                    </td>
                    <td>
                      <span className="stat-mean">
                        {rightMeasure ? fmt(rightMeasure.statMean) : '—'}
                      </span>
                      <RangeThermometer
                        range={rightMeasure?.range ?? null}
                        max={max}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {activeMetric ? (
        <section className="chart-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Distribution</p>
              <h3>{marketLabel(activeMetric)}</h3>
            </div>
            <span className="section-hint">
              Click another stat above to change the chart.
            </span>
          </div>
          <DistributionChart
            label={marketLabel(activeMetric)}
            leftName={left.player.name}
            rightName={right.player.name}
            left={left.markets[activeMetric] ?? null}
            right={right.markets[activeMetric] ?? null}
          />
        </section>
      ) : null}
    </section>
  );
}
