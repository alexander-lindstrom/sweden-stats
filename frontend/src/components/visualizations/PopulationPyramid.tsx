import { useState } from 'react';
import { CT } from './chartTokens';
import type { PyramidRow } from '@/datasets/scb/population';

export interface PopulationPyramidProps {
  data:            PyramidRow[];
  comparisonData?: PyramidRow[];
}

// ── Layout constants ──────────────────────────────────────────────────────────

const W            = 240;
const ROW_H        = 9;
const ROW_GAP      = 1;
const LABEL_COL_W  = 38;
const BAR_COL_W    = (W - LABEL_COL_W) / 2;  // 101
const MEN_END_X    = BAR_COL_W;               // men bars right-edge (draw leftward)
const WOMEN_X      = BAR_COL_W + LABEL_COL_W; // women bars left-edge (draw rightward)
const TOP_PAD      = 14;                       // room for column headers
const BOTTOM_PAD   = 18;

// ── Component ─────────────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  ageLabel: string;
  value: number;
  pct: number;
}

export function PopulationPyramid({ data, comparisonData }: PopulationPyramidProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (data.length === 0) { return null; }

  const totalPrimary = data.reduce((s, r) => s + r.men + r.women, 0) || 1;
  const totalComp    = comparisonData
    ? (comparisonData.reduce((s, r) => s + r.men + r.women, 0) || 1)
    : 1;

  // Compute a common max percentage so both datasets share the same x-axis scale.
  const maxPct = Math.max(
    ...data.map(r => Math.max(r.men, r.women) / totalPrimary),
    ...(comparisonData ? comparisonData.map(r => Math.max(r.men, r.women) / totalComp) : [0]),
  );
  const scale = maxPct > 0 ? BAR_COL_W / maxPct : BAR_COL_W;

  const N      = data.length;
  const chartH = TOP_PAD + N * (ROW_H + ROW_GAP) + BOTTOM_PAD;

  const rowY = (i: number) => TOP_PAD + i * (ROW_H + ROW_GAP);

  const hasComp = !!comparisonData && comparisonData.length > 0;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${chartH}`}
      className="block overflow-visible"
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Column headers */}
      <text
        x={MEN_END_X / 2} y={10}
        textAnchor="middle" fontSize={8} fontWeight={600} fill="#3b82f6"
      >Män</text>
      <text
        x={WOMEN_X + BAR_COL_W / 2} y={10}
        textAnchor="middle" fontSize={8} fontWeight={600} fill="#f43f5e"
      >Kvinnor</text>

      {/* Center divider lines */}
      <line x1={MEN_END_X} y1={TOP_PAD} x2={MEN_END_X} y2={TOP_PAD + N * (ROW_H + ROW_GAP)}
        stroke={CT.gridLine} strokeWidth={0.5} />
      <line x1={WOMEN_X} y1={TOP_PAD} x2={WOMEN_X} y2={TOP_PAD + N * (ROW_H + ROW_GAP)}
        stroke={CT.gridLine} strokeWidth={0.5} />

      {/* Rows */}
      {data.map((row, i) => {
        const y         = rowY(i);
        const menW      = (row.men   / totalPrimary) * scale;
        const womenW    = (row.women / totalPrimary) * scale;
        const comp      = comparisonData?.[i];
        const compMenW  = comp ? (comp.men   / totalComp) * scale : 0;
        const compWomW  = comp ? (comp.women / totalComp) * scale : 0;

        return (
          <g key={row.ageCode}>
            {/* Comparison bars (outlined, drawn behind primary) */}
            {comp && (
              <>
                <rect
                  x={MEN_END_X - compMenW} y={y}
                  width={compMenW} height={ROW_H}
                  fill="none"
                  stroke="rgba(249,115,22,0.65)"
                  strokeWidth={0.75}
                />
                <rect
                  x={WOMEN_X} y={y}
                  width={compWomW} height={ROW_H}
                  fill="none"
                  stroke="rgba(249,115,22,0.65)"
                  strokeWidth={0.75}
                />
              </>
            )}

            {/* Primary men bar */}
            <rect
              x={MEN_END_X - menW} y={y}
              width={menW} height={ROW_H}
              fill="rgba(59,130,246,0.7)"
              onMouseEnter={() => setTooltip({
                x: MEN_END_X - menW / 2,
                y,
                ageLabel: row.ageLabel,
                value:    row.men,
                pct:      row.men / totalPrimary * 100,
              })}
            />

            {/* Primary women bar */}
            <rect
              x={WOMEN_X} y={y}
              width={womenW} height={ROW_H}
              fill="rgba(244,63,94,0.7)"
              onMouseEnter={() => setTooltip({
                x: WOMEN_X + womenW / 2,
                y,
                ageLabel: row.ageLabel,
                value:    row.women,
                pct:      row.women / totalPrimary * 100,
              })}
            />

            {/* Age label */}
            <text
              x={(MEN_END_X + WOMEN_X) / 2}
              y={y + ROW_H / 2 + 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={6.5} fill={CT.tickText}
            >
              {row.ageLabel}
            </text>
          </g>
        );
      })}

      {/* Hover tooltip */}
      {tooltip && (() => {
        const line1 = tooltip.ageLabel;
        const line2 = `${tooltip.value.toLocaleString('sv-SE')} pers. (${tooltip.pct.toFixed(1)}%)`;
        const boxW = 110, lineH = 11, padX = 5, padY = 3;
        const boxH = 2 * lineH + padY * 2;
        const tx   = Math.max(2, Math.min(W - boxW - 2, tooltip.x - boxW / 2));
        const above = tooltip.y >= chartH / 2;
        const ty   = above ? tooltip.y - boxH - 2 : tooltip.y + ROW_H + 2;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={tx} y={ty} width={boxW} height={boxH}
              rx={2} fill="white" stroke={CT.border} strokeWidth={0.75} />
            <text x={tx + padX} y={ty + padY + lineH * 0.75}
              fontSize={8} fontWeight={600} fill="#374151">{line1}</text>
            <text x={tx + padX} y={ty + padY + lineH * 1.75}
              fontSize={7.5} fill="#6b7280">{line2}</text>
          </g>
        );
      })()}

      {/* Legend (only shown when comparison data is present) */}
      {hasComp && (() => {
        const legendY = TOP_PAD + N * (ROW_H + ROW_GAP) + 4;
        return (
          <g>
            <rect x={34} y={legendY + 1} width={8} height={7} fill="rgba(59,130,246,0.7)" />
            <text x={45} y={legendY + 7.5} fontSize={7} fill={CT.tickText}>Primärt</text>
            <rect x={94} y={legendY + 1} width={8} height={7}
              fill="none" stroke="rgba(249,115,22,0.65)" strokeWidth={0.75} />
            <text x={105} y={legendY + 7.5} fontSize={7} fill={CT.tickText}>Jämförelse</text>
          </g>
        );
      })()}
    </svg>
  );
}
