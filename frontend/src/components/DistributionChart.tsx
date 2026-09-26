import { useEffect, useRef } from 'react';
import '../threshold-thermometer.css';
import type { MarketDetail } from '../types';
import { echarts } from '../visualization/echarts';

interface Props {
  label: string;
  leftName: string;
  rightName: string;
  left: MarketDetail | null;
  right: MarketDetail | null;
}

interface ThresholdProps {
  label: string;
  leftName: string;
  rightName: string;
  left: MarketDetail;
  right: MarketDetail;
}

function formatProbability(value: number) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

function formatThreshold(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ThresholdThermometer({
  label,
  leftName,
  rightName,
  left,
  right,
}: ThresholdProps) {
  const thresholds = [
    ...new Set([
      ...left.graph.points.map((point) => point.x),
      ...right.graph.points.map((point) => point.x),
    ]),
  ].sort((a, b) => a - b);

  const players = [
    { key: 'left', name: leftName, detail: left },
    { key: 'right', name: rightName, detail: right },
  ] as const;

  return (
    <fieldset
      className="threshold-gauge-chart"
      data-chart-kind="threshold_gauge"
      aria-label={`${label} threshold probability comparison. Each thermometer shows the chance that each player reaches or exceeds the labeled threshold.`}
    >
      <legend className="sr-only">{label} threshold probabilities</legend>
      <div className="threshold-gauge-grid">
        {thresholds.map((threshold) => (
          <section
            className="threshold-gauge"
            key={threshold}
            aria-label={`${formatThreshold(threshold)} or more`}
          >
            <h4>{formatThreshold(threshold)}+</h4>
            <div className="threshold-gauge-plot">
              <div className="threshold-gauge-scale" aria-hidden="true">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <div className="threshold-thermometer" aria-hidden="true" />
              <div className="threshold-marker-layer">
                {players.map((player) => {
                  const point = player.detail.graph.points.find(
                    (candidate) => candidate.x === threshold,
                  );
                  if (!point) return null;
                  const probability = Math.max(
                    0,
                    Math.min(1, point.probability),
                  );
                  return (
                    <div
                      className={`threshold-marker threshold-marker-${player.key}`}
                      key={player.key}
                      style={{ top: `${(1 - probability) * 100}%` }}
                      aria-label={`${player.name} ${formatThreshold(threshold)} or more: ${formatProbability(probability)}`}
                    >
                      <span
                        className="threshold-marker-line"
                        aria-hidden="true"
                      />
                      <span className="threshold-marker-label">
                        {player.name}{' '}
                        <strong>{formatProbability(probability)}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>
      <p className="threshold-gauge-note">
        Marker height is P(player ≥ threshold).
      </p>
    </fieldset>
  );
}

export function DistributionChart({
  label,
  leftName,
  rightName,
  left,
  right,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !left || !right) return;
    const kind =
      left.graph.kind === right.graph.kind
        ? left.graph.kind
        : 'continuous_density';
    if (kind === 'threshold_gauge') return;

    const chart = echarts.init(ref.current);
    chart.setOption({
      animation: false,
      grid: { left: 48, right: 20, top: 54, bottom: 44 },
      tooltip: { trigger: 'axis' },
      legend: { top: 4, data: [leftName, rightName] },
      xAxis: {
        type: 'value',
        name: label,
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis: {
        type: 'value',
        name: 'Probability',
        axisLabel: {
          formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
        },
      },
      series: [
        {
          name: leftName,
          type: 'line',
          showSymbol: kind !== 'continuous_density',
          smooth: kind === 'discrete_pmf',
          data: left.graph.points.map((point) => [point.x, point.probability]),
        },
        {
          name: rightName,
          type: 'line',
          showSymbol: kind !== 'continuous_density',
          smooth: kind === 'discrete_pmf',
          data: right.graph.points.map((point) => [point.x, point.probability]),
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [label, left, leftName, right, rightName]);

  if (!left || !right) return null;

  const kind =
    left.graph.kind === right.graph.kind
      ? left.graph.kind
      : 'continuous_density';
  if (kind === 'threshold_gauge') {
    return (
      <ThresholdThermometer
        label={label}
        leftName={leftName}
        rightName={rightName}
        left={left}
        right={right}
      />
    );
  }

  return (
    <div
      className="distribution-chart"
      ref={ref}
      role="img"
      aria-label={`${label} probability comparison`}
    />
  );
}
