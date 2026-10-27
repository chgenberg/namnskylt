interface SparklineProps {
  values: readonly number[];
  className?: string;
  stroke?: string;
}

/** Liten trendlinje utan axlar — formen säger det viktiga. */
export function Sparkline({ values, className, stroke = "currentColor" }: SparklineProps) {
  const width = 120;
  const height = 40;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 4 - (v / max) * (height - 8)).toFixed(1)}`);
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} fill={stroke} opacity="0.12" />
      <polyline points={points.join(" ")} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
