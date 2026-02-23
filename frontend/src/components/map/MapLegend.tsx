import React from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';

interface MapLegendProps {
  data: DatasetResult | null;
  scale: d3.ScaleSequential<string> | null;
}

const GRADIENT_HEIGHT = 160;
const GRADIENT_WIDTH  = 20;
const STOPS = 10;

export const MapLegend: React.FC<MapLegendProps> = ({ data, scale }) => {
  if (!data || !scale) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm text-center p-4">
        Select a dataset to see the legend.
      </div>
    );
  }

  const [minVal, maxVal] = scale.domain() as [number, number];
  const midVal = (minVal + maxVal) / 2;

  // Gradient runs top→bottom; top should be the darkest (max) colour.
  const stops = Array.from({ length: STOPS }, (_, i) => {
    const t = i / (STOPS - 1); // 0 = top, 1 = bottom
    const value = maxVal - t * (maxVal - minVal); // max at top, min at bottom
    return { offset: `${t * 100}%`, color: scale(value) };
  });

  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(0)}k`
      : String(Math.round(n));

  const gradientId = 'legend-gradient';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-gray-700">{data.label}</p>
      <div className="flex items-stretch gap-3">
        {/* Gradient bar */}
        <svg width={GRADIENT_WIDTH} height={GRADIENT_HEIGHT}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {/* Top = max, bottom = min */}
              {stops.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={0}
            y={0}
            width={GRADIENT_WIDTH}
            height={GRADIENT_HEIGHT}
            fill={`url(#${gradientId})`}
            rx={3}
          />
        </svg>

        {/* Labels */}
        <div
          className="flex flex-col justify-between text-xs text-gray-600"
          style={{ height: GRADIENT_HEIGHT }}
        >
          <span>{fmt(maxVal)}</span>
          <span>{fmt(midVal)}</span>
          <span>{fmt(minVal)}</span>
        </div>
      </div>
      <p className="text-xs text-gray-400">{data.unit}</p>
    </div>
  );
};
