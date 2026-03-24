import React, { useEffect, useState } from 'react';
import * as d3 from 'd3';
import { CategoricalShareResult } from '@/datasets/types';
import { useChartBase } from '@/hooks/useChartBase';
import { CT } from './chartTokens';

interface Props {
  data:          CategoricalShareResult;
  selectedCode?: string | null;
  onSelect?:     (row: { code: string; label: string } | null) => void;
  /**
   * 'last-desc' (default): sort rows by last category share descending.
   * 'none': use row order as supplied — caller is responsible for sorting.
   */
  sort?: 'last-desc' | 'none';
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
 * One row per item (e.g. field of study). Category legend at the bottom.
 * Hovering shows a breakdown tooltip; clicking selects a row when onSelect is provided.
 */
export const ShareBarChart: React.FC<Props> = ({
  data,
  selectedCode = null,
  onSelect,
  sort = 'last-desc',
}) => {
  const { containerRef, svgRef, dimensions: dims } = useChartBase();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!dims || data.rows.length === 0) { return; }

    const { categories } = data;

    const sorted = sort === 'last-desc'
      ? [...data.rows].sort((a, b) => {
          const lastCat = categories[categories.length - 1];
          return (b.shares[lastCat.code] ?? 0) - (a.shares[lastCat.code] ?? 0);
        })
      : data.rows;

    const leftMargin  = dims.width < 480 ? 110 : MARGIN.left;
    const innerW      = dims.width - leftMargin - MARGIN.right;
    const innerH      = sorted.length * (BAR_H + BAR_GAP);
    const itemW       = dims.width < 480 ? 55 : 90;
    const itemsPerRow = Math.max(1, Math.floor(innerW / itemW));
    const legendRows  = Math.ceil(categories.length / itemsPerRow);
    const ROW_H       = 16;
    const totalH      = innerH + MARGIN.top + 14 + legendRows * ROW_H + 14;

    svg.attr('width', dims.width).attr('height', totalH);
    const g = svg.append('g').attr('transform', `translate(${leftMargin},${MARGIN.top})`);

    sorted.forEach((row, i) => {
      const y          = i * (BAR_H + BAR_GAP);
      const isSelected = selectedCode === row.code;

      // Determine visible (non-zero) categories for this row.
      const visibleCats = categories.filter(cat => (row.shares[cat.code] ?? 0) > 0);
      let xOffset = 0;

      visibleCats.forEach((cat, catIdx) => {
        const share       = row.shares[cat.code] ?? 0;
        const isLast      = catIdx === visibleCats.length - 1;
        // Fill the last segment to the edge to avoid floating-point trailing gaps.
        const theoreticalW = (share / 100) * innerW;
        const w            = isLast ? Math.max(0, innerW - xOffset) : theoreticalW;

        g.append('rect')
          .attr('x', xOffset).attr('y', y)
          .attr('width', w).attr('height', BAR_H)
          .attr('fill', cat.color)
          .attr('opacity', isSelected ? 1 : 0.85);

        // % label inside segment if wide enough.
        if (w > 36) {
          g.append('text')
            .attr('x', xOffset + w / 2).attr('y', y + BAR_H / 2)
            .attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('font-size', 11).attr('fill', 'rgba(255,255,255,0.92)')
            .attr('pointer-events', 'none')
            .text(`${share.toFixed(0)}%`);
        }

        xOffset += theoreticalW;
      });

      // Bar outline (thicker blue when selected).
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerW).attr('height', BAR_H)
        .attr('fill', 'none')
        .attr('stroke', isSelected ? '#1e40af' : '#000')
        .attr('stroke-width', isSelected ? 1.5 : 0.5)
        .attr('pointer-events', 'none');

      // Transparent hit target.
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerW).attr('height', BAR_H)
        .attr('fill', 'transparent')
        .attr('cursor', onSelect ? 'pointer' : 'default')
        .on('click', () => {
          if (!onSelect) { return; }
          onSelect(isSelected ? null : { code: row.code, label: row.label });
        })
        .on('mousemove', (event: MouseEvent) => {
          const container = containerRef.current!.getBoundingClientRect();
          setTooltip({
            x: event.clientX - container.left + 12,
            y: event.clientY - container.top - 8,
            rowCode: row.code,
          });
        })
        .on('mouseleave', () => setTooltip(null));

      // Row label (left).
      const maxLabelW = leftMargin - 16;
      g.append('text')
        .attr('x', -8).attr('y', y + BAR_H / 2)
        .attr('dy', '0.35em').attr('text-anchor', 'end')
        .attr('font-size', 12)
        .attr('fill', isSelected ? '#1e40af' : '#475569')
        .attr('font-weight', isSelected ? 600 : 400)
        .attr('pointer-events', 'none')
        .text(row.label)
        .each(function() {
          const el = this as SVGTextElement;
          if (el.getComputedTextLength() <= maxLabelW) { return; }
          let t = el.textContent ?? '';
          while (t.length > 2 && el.getComputedTextLength() > maxLabelW) {
            t = t.slice(0, -1);
            el.textContent = t + '…';
          }
        });
    });

    // Legend at bottom — wraps to multiple rows when items don't fit.
    const legendX = Math.max(0, (innerW - Math.min(categories.length, itemsPerRow) * itemW) / 2);
    const legend  = g.append('g').attr('transform', `translate(${legendX},${innerH + 14})`);

    categories.forEach((cat, i) => {
      const col = i % itemsPerRow;
      const row = Math.floor(i / itemsPerRow);
      const x   = col * itemW;
      const y   = row * ROW_H;
      legend.append('rect').attr('x', x).attr('y', y).attr('width', 12).attr('height', 12)
        .attr('fill', cat.color).attr('rx', 2);
      legend.append('text').attr('x', x + 16).attr('y', y + 6).attr('dy', '0.35em')
        .attr('font-size', 11).attr('fill', CT.axisLabel)
        .text(cat.label);
    });

  }, [data, selectedCode, onSelect, sort, dims, containerRef, svgRef]);

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
                <span className="text-slate-300">{cat.tooltipLabel ?? cat.label}</span>
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
