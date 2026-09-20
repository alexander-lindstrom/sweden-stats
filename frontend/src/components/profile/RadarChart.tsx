import { useState } from 'react';
import type { RadarAxis } from '@/hooks/useAreaStats';
import { formatNumber } from '@/utils/format';

const RADAR_WEB = [0.25, 0.5, 0.75, 1] as const;

/**
 * Spider/radar chart showing percentile scores across multiple axes.
 * Optionally overlays a second set of axes (comparison, in orange).
 * Hover a vertex dot to see the exact value, percentile, and rank.
 */
export function RadarChart({ axes, comparisonAxes }: { axes: RadarAxis[]; comparisonAxes?: RadarAxis[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const N  = axes.length;
  const CX = 108, CY = 80, R = 52;
  const H  = 142;

  const angle = (i: number) => (2 * Math.PI * i / N) - Math.PI / 2;
  const pt = (v: number, i: number): [number, number] => [
    CX + R * v * Math.cos(angle(i)),
    CY + R * v * Math.sin(angle(i)),
  ];
  const ring = (v: number) =>
    axes.map((_, i) => pt(v, i))
      .map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ') + 'Z';

  const valuePath = axes
    .map((a, i) => pt(a.percentile, i))
    .map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ') + 'Z';

  const compPath = comparisonAxes && comparisonAxes.length === N
    ? comparisonAxes
        .map((a, i) => pt(a.percentile, i))
        .map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ') + 'Z'
    : null;

  // Build tooltip data when a vertex is hovered.
  const tooltip = hovered !== null ? (() => {
    const axis = axes[hovered];
    const [vx, vy] = pt(axis.percentile, hovered);
    const lines: Array<{ text: string; bold?: boolean }> = [];
    if (axis.value != null) {
      lines.push({ text: `${formatNumber(axis.value)} ${axis.unit ?? ''}`.trim(), bold: true });
    }
    lines.push({ text: `Percentil: ${Math.round(axis.percentile * 100)}%` });
    if (axis.rank != null && axis.total != null) {
      lines.push({ text: `#${axis.rank} av ${axis.total}` });
    }
    const lineH = 11, padX = 6, padY = 4, boxW = 94;
    const boxH = lines.length * lineH + padY * 2;
    const above = vy >= CY;
    const tx = Math.max(2, Math.min(CX * 2 - boxW - 2, vx - boxW / 2));
    const ty = above ? vy - boxH - 7 : vy + 7;
    return { lines, lineH, padX, padY, boxW, boxH, tx, ty };
  })() : null;

  return (
    <svg width="100%" viewBox={`0 0 ${CX * 2} ${H}`} className="block overflow-visible">
      {/* Web grid */}
      {RADAR_WEB.map(v => (
        <path key={v} d={ring(v)} fill="none"
          stroke={v === 0.5 ? '#94a3b8' : '#e2e8f0'}
          strokeWidth={v === 0.5 ? 1 : 0.75}
          strokeDasharray={v === 0.5 ? '3 3' : undefined}
        />
      ))}
      {/* Axis spokes */}
      {axes.map((_, i) => {
        const [x2, y2] = pt(1, i);
        return <line key={i} x1={CX} y1={CY} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#e2e8f0" strokeWidth={0.75} />;
      })}
      {/* Comparison polygon (orange, behind primary) */}
      {compPath && (
        <>
          <path d={compPath} fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth={1.5} strokeLinejoin="round" />
          {comparisonAxes!.map((a, i) => {
            const [cx, cy] = pt(a.percentile, i);
            return <circle key={`comp-${i}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.5} fill="#f97316" />;
          })}
        </>
      )}
      {/* Primary value polygon (blue) */}
      <path d={valuePath} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" />
      {/* Vertex dots */}
      {axes.map((a, i) => {
        const [cx, cy] = pt(a.percentile, i);
        return <circle key={i} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.5} fill="#3b82f6" />;
      })}
      {/* Large transparent hit areas for hover */}
      {axes.map((a, i) => {
        const [cx, cy] = pt(a.percentile, i);
        return (
          <circle key={`hit-${i}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={10}
            fill="transparent" style={{ cursor: 'default' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        );
      })}
      {/* Axis labels — anchor direction follows which side of centre the label is on */}
      {axes.map(({ label }, i) => {
        const [x, y] = pt(1.28, i);
        const anchor = x < CX - 4 ? 'end' : x > CX + 4 ? 'start' : 'middle';
        return (
          <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle"
            fontSize={9} fontWeight={600} fill={hovered === i ? '#3b82f6' : '#64748b'}>
            {label}
          </text>
        );
      })}
      <circle cx={CX} cy={CY} r={2} fill="#e2e8f0" />
      {/* Tooltip */}
      {tooltip && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={tooltip.tx} y={tooltip.ty} width={tooltip.boxW} height={tooltip.boxH}
            rx={3} fill="white" stroke="#cbd5e1" strokeWidth={0.75} />
          {tooltip.lines.map(({ text, bold }, li) => (
            <text key={li}
              x={tooltip.tx + tooltip.padX}
              y={tooltip.ty + tooltip.padY + li * tooltip.lineH + tooltip.lineH * 0.75}
              fontSize={8.5} fontWeight={bold ? 600 : 400} fill="#475569">
              {text}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
