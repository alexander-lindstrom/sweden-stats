import React from 'react';
import { DatasetResult } from '@/datasets/types';
import type { ColorLegendSpec } from '@/hooks/useDatasetFetch';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { formatCompact, formatNumber } from '@/utils/format';

interface MapLegendProps {
  data:    DatasetResult | null;
  legend:  ColorLegendSpec | null;
  year?:   number;
  source?: string;
}

const GRADIENT_HEIGHT = 96;
const GRADIENT_WIDTH  = 14;
const STOPS           = 12;

/** Legend numbers: compact for large counts, decimals kept for small values. */
const fmt = (n: number) => (Math.abs(n) >= 10_000 ? formatCompact(n) : formatNumber(n));

function LegendTitle({ label, source, year }: { label: string; source?: string; year?: number }) {
  return (
    <SectionLabel className="leading-tight block whitespace-normal">
      {label}{source ? ` · ${source}` : ''}{year ? ` · ${year}` : ''}
    </SectionLabel>
  );
}

function EmptyLegend() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm text-center p-4">
      Välj ett dataset för att visa teckenförklaringen.
    </div>
  );
}

/** Discrete swatches, highest class on top, with the class boundaries between them. */
function ClassedLegend({ breaks, colors, unit }: { breaks: number[]; colors: string[]; unit: string }) {
  const k = colors.length;
  const rows = colors.map((color, i) => {
    const lo = i > 0     ? breaks[i - 1] : null;
    const hi = i < k - 1 ? breaks[i]     : null;
    const text =
      lo === null && hi === null ? '—'
      : lo === null ? `< ${fmt(hi!)}`
      : hi === null ? `≥ ${fmt(lo)}`
      : `${fmt(lo)} – ${fmt(hi)}`;
    return { color, text };
  }).reverse();

  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
            style={{ backgroundColor: r.color }}
          />
          <span className="text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
            {r.text}{unit && i === 0 ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Continuous bar for diverging and per-party scales. The centre label sits at the centre value. */
function GradientLegend({ domain, center, scale, unit }: {
  domain: [number, number];
  center?: number;
  scale:  (value: number) => string;
  unit:   string;
}) {
  const [minVal, maxVal] = domain;
  const stops = Array.from({ length: STOPS }, (_, i) => {
    const t     = i / (STOPS - 1);
    const value = maxVal - t * (maxVal - minVal);
    return { offset: `${t * 100}%`, color: scale(value) };
  });

  const span      = maxVal - minVal || 1;
  const midVal    = center ?? (minVal + maxVal) / 2;
  const midPct    = (1 - (midVal - minVal) / span) * 100;
  const showMid   = midPct > 14 && midPct < 86;
  const gradientId = 'legend-gradient';

  return (
    <div className="flex items-stretch gap-2">
      <svg width={GRADIENT_WIDTH} height={GRADIENT_HEIGHT} className="flex-shrink-0">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            {stops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={GRADIENT_WIDTH} height={GRADIENT_HEIGHT} fill={`url(#${gradientId})`} rx={3} />
      </svg>
      <div className="relative" style={{ height: GRADIENT_HEIGHT, minWidth: '3rem' }}>
        <span className="absolute top-0 left-0 -translate-y-[40%] text-[10px] font-medium text-slate-600 tabular-nums whitespace-nowrap">
          {fmt(maxVal)}{unit ? ` ${unit}` : ''}
        </span>
        {showMid && (
          <span
            className="absolute left-0 -translate-y-1/2 text-[10px] text-slate-400 tabular-nums whitespace-nowrap"
            style={{ top: `${midPct}%` }}
          >
            {fmt(midVal)}
          </span>
        )}
        <span className="absolute bottom-0 left-0 translate-y-[40%] text-[10px] font-medium text-slate-600 tabular-nums whitespace-nowrap">
          {fmt(minVal)}
        </span>
      </div>
    </div>
  );
}

export const MapLegend: React.FC<MapLegendProps> = ({ data, legend, year, source }) => {
  if (!data) { return <EmptyLegend />; }

  // ── Election: party color swatches ────────────────────────────────────────
  if (data.kind === 'election') {
    const presentParties = new Set(Object.values(data.winnerByGeo));
    const parties = PARTY_CODES.filter(p => presentParties.has(p));
    return (
      <div className="flex flex-col gap-1.5 w-max max-w-[14rem]">
        <LegendTitle label={data.label} source={source} year={year} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {parties.map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: PARTY_COLORS[p] }} />
              <span className="text-[10px] text-slate-600">{PARTY_LABELS[p] ?? p}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!legend) { return <EmptyLegend />; }

  return (
    <div className="flex flex-col gap-2 w-max max-w-[13rem]">
      <LegendTitle label={data.label} source={source} year={year} />
      {legend.kind === 'classes'
        ? <ClassedLegend breaks={legend.breaks} colors={legend.colors} unit={data.unit} />
        : <GradientLegend domain={legend.domain} center={legend.center} scale={legend.scale} unit={data.unit} />}
    </div>
  );
};
