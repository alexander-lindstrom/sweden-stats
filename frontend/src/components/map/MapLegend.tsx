import React from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';

interface MapLegendProps {
  data: DatasetResult | null;
  scale: d3.ScaleSequential<string> | null;
  year?: number;
  source?: string;
}

const GRADIENT_HEIGHT = 96;
const GRADIENT_WIDTH  = 14;
const STOPS = 10;

export const MapLegend: React.FC<MapLegendProps> = ({ data, scale, year, source }) => {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm text-center p-4">
        Välj ett dataset för att visa teckenförklaringen.
      </div>
    );
  }

  // ── Election: party color swatches ────────────────────────────────────────
  if (data.kind === 'election') {
    const presentParties = new Set(Object.values(data.winnerByGeo));
    const parties = PARTY_CODES.filter(p => presentParties.has(p));
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{data.label}{source ? ` · ${source}` : ''}{year ? ` · ${year}` : ''}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {parties.map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: PARTY_COLORS[p] }}
              />
              <span className="text-[10px] text-slate-600">{PARTY_LABELS[p] ?? p}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Scalar: gradient bar ──────────────────────────────────────────────────
  if (!scale) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm text-center p-4">
        Välj ett dataset för att visa teckenförklaringen.
      </div>
    );
  }

  const [minVal, maxVal] = scale.domain() as [number, number];
  const midVal = (minVal + maxVal) / 2;

  const stops = Array.from({ length: STOPS }, (_, i) => {
    const t = i / (STOPS - 1);
    const value = maxVal - t * (maxVal - minVal);
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
    <div className="flex flex-col gap-2 w-24">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{data.label}{source ? ` · ${source}` : ''}{year ? ` · ${year}` : ''}</p>
      <div className="flex items-stretch gap-2">
        <svg width={GRADIENT_WIDTH} height={GRADIENT_HEIGHT} className="flex-shrink-0">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {stops.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={0} y={0}
            width={GRADIENT_WIDTH} height={GRADIENT_HEIGHT}
            fill={`url(#${gradientId})`} rx={3}
          />
        </svg>
        <div
          className="flex flex-col justify-between"
          style={{ height: GRADIENT_HEIGHT }}
        >
          <span className="text-[10px] font-medium text-slate-600 tabular-nums">{fmt(maxVal)}{data.unit ? ` ${data.unit}` : ''}</span>
          <span className="text-[10px] text-slate-400 tabular-nums">{fmt(midVal)}</span>
          <span className="text-[10px] font-medium text-slate-600 tabular-nums">{fmt(minVal)}</span>
        </div>
      </div>
    </div>
  );
};
