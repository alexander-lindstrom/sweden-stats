import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { CT } from './chartTokens';
import { UI } from '@/theme';
import type { PyramidRow } from '@/datasets/scb/population';
import { useChartBase } from '@/hooks/useChartBase';

export interface PopulationPyramidProps {
  data: PyramidRow[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MergedRow {
  ageCode:  string;
  ageLabel: string;
  men:      number;
  women:    number;
}

interface TooltipState {
  clientX:  number;
  clientY:  number;
  ageLabel: string;
  men:      number;
  women:    number;
  total:    number;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const MARGIN  = { top: 22, right: 6, bottom: 28, left: 6 };
const LABEL_W = 42;
const ROW_H   = 18;
const ROW_PAD = 2;
const BAR_R   = 2;
const BAR_OP  = 0.72;

// ── Bin merging (5-year → 10-year) ───────────────────────────────────────────

function mergeTo10Year(rows: PyramidRow[]): MergedRow[] {
  const out: MergedRow[] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const a = rows[i], b = rows[i + 1];
    const [startA] = a.ageLabel.split('–');
    const partsB   = b.ageLabel.split('–');
    const endB     = partsB.length > 1 ? partsB[1] : b.ageLabel;
    out.push({
      ageCode:  `${a.ageCode}+${b.ageCode}`,
      ageLabel: `${startA}–${endB}`,
      men:      a.men + b.men,
      women:    a.women + b.women,
    });
  }
  if (rows.length % 2 !== 0) { out.push(rows[rows.length - 1]); }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PopulationPyramid({ data }: PopulationPyramidProps) {
  const { containerRef, svgRef, dimensions } = useChartBase();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const rows = useMemo(() => mergeTo10Year(data), [data]);

  useEffect(() => {
    if (!svgRef.current || !dimensions || rows.length === 0) { return; }

    const { width } = dimensions;
    const innerW    = width - MARGIN.left - MARGIN.right;
    const barColW   = (innerW - LABEL_W) / 2;
    if (barColW <= 0) { return; }

    const n      = rows.length;
    const innerH = n * ROW_H + Math.max(n - 1, 0) * ROW_PAD;
    const svgH   = innerH + MARGIN.top + MARGIN.bottom;

    const total  = rows.reduce((s, r) => s + r.men + r.women, 0) || 1;
    const maxPct = Math.max(...rows.map(r => Math.max(r.men, r.women) / total));

    const xScale = d3.scaleLinear().domain([0, maxPct * 1.05]).range([0, barColW]);
    const ticks  = xScale.ticks(Math.max(2, Math.floor(barColW / 45))).filter(t => t > 0);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', svgH)
       .attr('font-family', 'system-ui, sans-serif');

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Column headers ────────────────────────────────────────────────────────

    g.append('text')
      .attr('x', barColW / 2).attr('y', -7)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', '600')
      .attr('fill', CT.menFill).text('Män');

    g.append('text')
      .attr('x', barColW + LABEL_W + barColW / 2).attr('y', -7)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', '600')
      .attr('fill', CT.womenFill).text('Kvinnor');

    // ── Vertical grid lines (behind bars) ────────────────────────────────────

    ticks.forEach(t => {
      for (const x of [barColW - xScale(t), barColW + LABEL_W + xScale(t)]) {
        g.append('line')
          .attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', innerH)
          .attr('stroke', CT.gridLine).attr('stroke-width', 0.5);
      }
    });

    // ── Center dividers ───────────────────────────────────────────────────────

    for (const x of [barColW, barColW + LABEL_W]) {
      g.append('line')
        .attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', CT.border).attr('stroke-width', 0.5);
    }

    // ── Rows ──────────────────────────────────────────────────────────────────

    // Diff indicator: scale the gender imbalance relative to the most unequal bin.
    const maxRelDiff = Math.max(
      ...rows.map(r => Math.abs(r.men - r.women) / (r.men + r.women || 1)),
    ) || 1;
    const maxSliverW = LABEL_W / 2 - 4;  // half the label column, minus padding
    const labelCx    = barColW + LABEL_W / 2;

    const rowGroups = g.selectAll<SVGGElement, MergedRow>('g.row')
      .data(rows, d => d.ageCode)
      .join('g').attr('class', 'row');

    // Track the currently hovered row group so we can restore it on leave.
    let hoveredRg: d3.Selection<SVGGElement, MergedRow, null, undefined> | null = null;

    rowGroups.each(function(row, i) {
      const rg   = d3.select<SVGGElement, MergedRow>(this);
      const y    = i * (ROW_H + ROW_PAD);
      const menW = xScale(row.men   / total);
      const womW = xScale(row.women / total);

      rg.append('rect').attr('class', 'men-bar')
        .attr('x', barColW - menW).attr('y', y)
        .attr('width', menW).attr('height', ROW_H)
        .attr('rx', BAR_R)
        .attr('fill', CT.menFill).attr('fill-opacity', BAR_OP)
        .attr('stroke', CT.barStroke).attr('stroke-width', 0.5);

      rg.append('rect').attr('class', 'wom-bar')
        .attr('x', barColW + LABEL_W).attr('y', y)
        .attr('width', womW).attr('height', ROW_H)
        .attr('rx', BAR_R)
        .attr('fill', CT.womenFill).attr('fill-opacity', BAR_OP)
        .attr('stroke', CT.barStroke).attr('stroke-width', 0.5);

      // Age label — centered in label column, shifted slightly upward to leave
      // room for the diff sliver at the bottom.
      rg.append('text')
        .attr('x', labelCx).attr('y', y + ROW_H / 2 - 1)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', 8).attr('fill', CT.tickText)
        .text(row.ageLabel);

      // Gender-imbalance sliver — a small pill at the bottom of the label
      // column, extending toward the dominant side.
      const relDiff  = (row.men - row.women) / (row.men + row.women || 1);
      const sliverW  = (Math.abs(relDiff) / maxRelDiff) * maxSliverW;
      const sliverX  = relDiff > 0 ? labelCx - sliverW : labelCx;
      const sliverFill = relDiff > 0 ? CT.menFill : CT.womenFill;
      rg.append('rect').attr('class', 'diff-sliver')
        .attr('x', sliverX).attr('y', y + ROW_H - 3.5)
        .attr('width', sliverW).attr('height', 2.5)
        .attr('rx', 1)
        .attr('fill', sliverFill).attr('fill-opacity', 0.6);

      // Transparent hit area on top — covers the full row width.
      rg.append('rect').attr('class', 'hit')
        .attr('x', 0).attr('y', y).attr('width', innerW).attr('height', ROW_H)
        .attr('fill', 'transparent')
        .on('mousemove', (event: MouseEvent) => {
          if (hoveredRg && hoveredRg.node() !== rg.node()) {
            hoveredRg.selectAll<SVGRectElement, unknown>('.men-bar, .wom-bar')
              .attr('fill-opacity', BAR_OP);
          }
          hoveredRg = rg;
          rg.selectAll<SVGRectElement, unknown>('.men-bar, .wom-bar')
            .attr('fill-opacity', BAR_OP * 0.55);
          setTooltip({
            clientX: event.clientX, clientY: event.clientY,
            ageLabel: row.ageLabel, men: row.men, women: row.women, total,
          });
        });
    });

    // ── Bottom % axis ─────────────────────────────────────────────────────────

    // Baseline — each bar column gets its own segment (label column has no axis).
    g.append('line')
      .attr('x1', 0).attr('x2', barColW)
      .attr('y1', innerH).attr('y2', innerH)
      .attr('stroke', CT.border).attr('stroke-width', 0.5);
    g.append('line')
      .attr('x1', barColW + LABEL_W).attr('x2', innerW)
      .attr('y1', innerH).attr('y2', innerH)
      .attr('stroke', CT.border).attr('stroke-width', 0.5);

    const axY = innerH + 5;
    ticks.forEach(t => {
      const lbl = `${(t * 100).toFixed(0)}%`;
      for (const x of [barColW - xScale(t), barColW + LABEL_W + xScale(t)]) {
        g.append('line')
          .attr('x1', x).attr('x2', x).attr('y1', innerH).attr('y2', axY + 2)
          .attr('stroke', CT.tickText).attr('stroke-width', 0.5);
        g.append('text')
          .attr('x', x).attr('y', axY + 10)
          .attr('text-anchor', 'middle').attr('font-size', 7).attr('fill', CT.tickText)
          .text(lbl);
      }
    });

    // ── Clear on SVG mouse-leave ──────────────────────────────────────────────

    svg.on('mouseleave', () => {
      if (hoveredRg) {
        hoveredRg.selectAll<SVGRectElement, unknown>('.men-bar, .wom-bar')
          .attr('fill-opacity', BAR_OP);
        hoveredRg = null;
      }
      setTooltip(null);
    });

  }, [rows, dimensions, svgRef]);

  const n      = rows.length;
  const innerH = n * ROW_H + Math.max(n - 1, 0) * ROW_PAD;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} style={{ height: innerH + MARGIN.top + MARGIN.bottom }} />
      {tooltip && (
        <div
          className={UI.tooltip}
          style={{ left: tooltip.clientX + 14, top: tooltip.clientY - 10 }}
        >
          <div className="font-semibold">{tooltip.ageLabel}</div>
          <div className="text-blue-300">
            Män: {tooltip.men.toLocaleString('sv-SE')} ({(tooltip.men / tooltip.total * 100).toFixed(1)}%)
          </div>
          <div className="text-rose-300">
            Kvinnor: {tooltip.women.toLocaleString('sv-SE')} ({(tooltip.women / tooltip.total * 100).toFixed(1)}%)
          </div>
          {(() => {
            const diff    = tooltip.women - tooltip.men;
            const diffPct = Math.abs(diff) / (tooltip.men + tooltip.women) * 100;
            const label   = diff > 0 ? 'fler Kvinnor' : 'fler Män';
            return (
              <div className={`mt-0.5 ${diff > 0 ? 'text-rose-300' : 'text-blue-300'}`}>
                +{diffPct.toFixed(1)}% {label}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
