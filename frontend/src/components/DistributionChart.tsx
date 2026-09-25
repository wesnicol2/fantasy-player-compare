import { useEffect, useRef } from 'react';
import type { MarketDetail } from '../types';
import { echarts } from '../visualization/echarts';

interface Props {
  label: string;
  leftName: string;
  rightName: string;
  left: MarketDetail | null;
  right: MarketDetail | null;
}

export function DistributionChart({ label, leftName, rightName, left, right }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !left || !right) return;
    const chart = echarts.init(ref.current);
    const kind = left.graph.kind === right.graph.kind ? left.graph.kind : 'continuous_density';
    const seriesType = kind === 'threshold_gauge' ? 'bar' : 'line';
    chart.setOption({
      animation: false,
      grid: { left: 48, right: 20, top: 54, bottom: 44 },
      tooltip: { trigger: 'axis' },
      legend: { top: 4, data: [leftName, rightName] },
      xAxis: { type: 'value', name: label, nameLocation: 'middle', nameGap: 30 },
      yAxis: {
        type: 'value',
        name: kind === 'threshold_gauge' ? 'P(≥ x)' : 'Probability',
        axisLabel: { formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
      },
      series: [
        {
          name: leftName,
          type: seriesType,
          showSymbol: kind !== 'continuous_density',
          smooth: kind === 'discrete_pmf',
          data: left.graph.points.map((point) => [point.x, point.probability]),
        },
        {
          name: rightName,
          type: seriesType,
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
  return (
    <div
      className="distribution-chart"
      ref={ref}
      role="img"
      aria-label={`${label} probability comparison`}
    />
  );
}
