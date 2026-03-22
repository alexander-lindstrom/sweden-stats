import React, { useEffect, useState } from 'react';
import * as d3 from 'd3';
import { CategoricalShareResult } from '@/datasets/types';
import { useChartBase } from '@/hooks/useChartBase';
import { CT } from './chartTokens';

interface Props {
  data: CategoricalShareResult;
}

const MARGIN  = { top: 8, right: 16, bottom: 44, left: 210 };
const BAR_H   = 24;
const BAR_GAP = 5;

interface TooltipState {
  x: number;
  y: number;
  rowCode: string;
}

/**
 * Stacked 100% horizontal bar chart with generic categories.
 * One row per item (e.g. field of study), sorted by last category's share descending.
 * Category legend sits at the bottom. Hovering shows a breakdown tooltip.
 */
export const ShareBarChart: React.FC<Props> = ({ data }) => {
  const { containerRef, svgRef, dimensions: dims } = useChartBase();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!dims || data.rows.length === 0) { return; }

    const { categories } = data;
    const lastCat = categories[categories.length - 1];

    // Sort rows by last category's share descending (e.g. % women highest to lowest).
    const sorted = [...data.rows].sort(
      (a, b) => (b.shares[lastCat.code] ?? 0) - (a.shares[lastCat.code] ?? 0),
    );

    const innerW = dims.width - MARGIN.left - MARGIN.right;
    const innerH = sorted.length * (BAR_H + BAR_GAP);
    const totalH = innerH + MARGIN.top + MARGIN.bottom;

    svg.attr('width', dims.width).attr('height', totalH);
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    sorted.forEach((row, i) => {
      const y = i * (BAR_H + BAR_GAP);
      let xOffset = 0;

      categories.forEach(cat => {
        const share = row.shares[cat.code] ?? 0;
        if (share <= 0) { return; }
        const w = (share / 100) * innerW;

        g.append('rect')
          .attr('x', xOffset).attr('y', y)
          .attr('width', Math.max(0, w - 1)).attr('height', BAR_H)
          .attr('fill', cat.color)
          .attr('opacity', 0.85);

        // % label inside segment if wide enough.
        if (w > 36) {
          g.append('text')
            .attr('x', xOffset + w / 2).attr('y', y + BAR_H / 2)
            .attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('font-size', 11).attr('fill', 'rgba(255,255,255,0.92)')
            .attr('pointer-events', 'none')
            .text(`${share.toFixed(0)}%`);
        }

        xOffset += w;
      });

      // Bar outline.
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerW).attr('height', BAR_H)
        .attr('fill', 'none')
        .attr('stroke', '#000').attr('stroke-width', 0.5)
        .attr('pointer-events', 'none');

      // Transparent hit target.
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerW).attr('height', BAR_H)
        .attr('fill', 'transparent').attr('cursor', 'default')
        .on('mousemove', (event: MouseEvent) => {
          const container = containerRef.current!.getBoundingClientRect();
          setTooltip({ x: event.clientX - container.left + 12, y: event.clientY - container.top - 8, rowCode: row.code });
        })
        .on('mouseleave', () => setTooltip(null));

      // Row label (left).
      g.append('text')
        .attr('x', -8).attr('y', y + BAR_H / 2)
        .attr('dy', '0.35em').attr('text-anchor', 'end')
        .attr('font-size', 12).attr('fill', '#475569')
        .attr('pointer-events', 'none')
        .text(row.label);
    });

    // Legend at bottom.
    const ITEM_W  = 90;
    const legendW = categories.length * ITEM_W;
    const legendX = Math.max(0, (innerW - legendW) / 2);
    const legend  = g.append('g').attr('transform', `translate(${legendX},${innerH + 14})`);

    categories.forEach((cat, i) => {
      const x = i * ITEM_W;
      legend.append('rect').attr('x', x).attr('y', 0).attr('width', 12).attr('height', 12)
        .attr('fill', cat.color).attr('rx', 2);
      legend.append('text').attr('x', x + 16).attr('y', 6).attr('dy', '0.35em')
        .attr('font-size', 11).attr('fill', CT.axisLabel)
        .text(cat.label);
    });

  }, [data, dims, containerRef, svgRef]);

  const tooltipRowData = tooltip
    ? data.rows.find(r => r.code === tooltip.rowCode)
    : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} className="w-full" />

      {tooltip && tooltipRowData && (
        <div
          className="pointer-events-none absolute z-20 bg-slate-800 text-white rounded-md shadow-lg px-3 py-2 text-xs"
          style={{ left: tooltip.x, top: tooltip.y, maxWidth: 220 }}
        >
          <div className="font-semibold mb-1.5 text-slate-100">{tooltipRowData.label}</div>
          <div className="space-y-0.5">
            {data.categories.map(cat => (
              <div key={cat.code} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-slate-300">{cat.label}</span>
                <span className="ml-auto tabular-nums text-slate-100 pl-3">
                  {(tooltipRowData.shares[cat.code] ?? 0).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
