interface Props {
  range: [number, number, number] | null;
  max: number;
}

export function RangeThermometer({ range, max }: Props) {
  if (!range || max <= 0) return <span className="range-empty">—</span>;
  const [floor, mid, ceiling] = range;
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  return (
    <span
      className="range-thermometer"
      aria-label={`floor ${floor.toFixed(1)}, median ${mid.toFixed(1)}, ceiling ${ceiling.toFixed(1)}`}
    >
      <span className="range-track" />
      <span className="range-band" style={{ left: pct(floor), width: pct(ceiling - floor) }} />
      <span className="range-mid" style={{ left: pct(mid) }} />
      <span className="range-values" aria-hidden="true">
        {floor.toFixed(1)} / {mid.toFixed(1)} / {ceiling.toFixed(1)}
      </span>
    </span>
  );
}
