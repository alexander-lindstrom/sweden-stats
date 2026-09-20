import type { SparkPoint } from '@/hooks/useAreaExtras';

/**
 * Minimal population trend line. The stroke colour encodes direction (green
 * up, red down); in comparison mode the primary is blue and the comparison
 * a dashed orange line.
 */
export function Sparkline({
  data,
  comparisonData,
  width  = 220,
  height = 56,
}: {
  data:            SparkPoint[];
  comparisonData?: SparkPoint[];
  /** Coordinate-space size; the SVG scales to its container width. */
  width?:  number;
  height?: number;
}) {
  if (data.length < 2) { return null; }

  const W = width, H = height, pad = 4;
  const isComparing = !!comparisonData && comparisonData.length >= 2;
  const allVals = [...data.map(d => d.value), ...(comparisonData?.map(d => d.value) ?? [])];
  const minV   = Math.min(...allVals);
  const maxV   = Math.max(...allVals);
  const range  = maxV - minV || 1;
  const innerH = H - pad * 2;

  const toXY = (d: { value: number }, i: number, len: number): [number, number] => [
    (i / (len - 1)) * W,
    pad + innerH - ((d.value - minV) / range) * innerH,
  ];

  const toPoints = (series: SparkPoint[]) =>
    series.map((d, i) => {
      const [x, y] = toXY(d, i, series.length);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

  const trend  = data[data.length - 1].value > data[0].value ? 'up' : data[data.length - 1].value < data[0].value ? 'down' : 'flat';
  const primaryStroke = isComparing ? '#3b82f6' : (trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#9ca3af');

  const lastPrimary = toXY(data[data.length - 1], data.length - 1, data.length);
  const lastComp    = isComparing ? toXY(comparisonData![comparisonData!.length - 1], comparisonData!.length - 1, comparisonData!.length) : null;

  const midY = pad + innerH / 2;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block overflow-visible">
      {/* Midrange reference line */}
      <line x1={0} y1={midY} x2={W} y2={midY} stroke="#e2e8f0" strokeWidth={0.75} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />

      {/* Comparison line (orange, dashed) */}
      {isComparing && (
        <>
          <polyline
            points={toPoints(comparisonData!)}
            fill="none"
            stroke="#f97316"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
          />
          {lastComp && (
            <circle cx={lastComp[0].toFixed(1)} cy={lastComp[1].toFixed(1)} r={3} fill="#f97316" />
          )}
        </>
      )}

      {/* Primary line */}
      <polyline
        points={toPoints(data)}
        fill="none"
        stroke={primaryStroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Primary endpoint dot */}
      <circle cx={lastPrimary[0].toFixed(1)} cy={lastPrimary[1].toFixed(1)} r={3} fill={primaryStroke} />
    </svg>
  );
}
