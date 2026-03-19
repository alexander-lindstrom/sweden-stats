import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ScalarDatasetResult } from '@/datasets/types';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { useChartBase } from '@/hooks/useChartBase';
import { CT } from './chartTokens';
import { drawChartFrame } from './chartFrame';

interface Props {
  data: ScalarDatasetResult;
  colorScale?: ((v: number) => string) | null;
  selectedFeature?: { code: string; label: string } | null;
}

interface BoxStats {
  countyCode:    string;
  countyName:    string;
  q1:            number;
  median:        number;
  q3:            number;
  lowerWhisker:  number;
  upperWhisker:  number;
  outliers:      number[];
  count:         number;
  selectedValue: number | null;
}

interface Hovered {
  stats:   BoxStats;
  clientX: number;
  clientY: number;
}

const MARGIN = { top: 16, right: 32, bottom: 48, left: 120 };
const ROW_H  = 26; // px per county row
const BOX_H  = 13; // height of the IQR box

function quantile(sorted: number[], p: number): number {
  const h  = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

function buildStats(data: ScalarDatasetResult, selCode: string | null): BoxStats[] {
  const groups: Record<string, number[]> = {};
  const selCounty = selCode?.slice(0, 2) ?? null;
  let selCountyVal: number | null = null;

  for (const [code, value] of Object.entries(data.values)) {
    if (!Number.isFinite(value)) { continue; }
    const county = code.slice(0, 2);
    if (!COUNTY_NAMES[county]) { continue; }  // skip non-county prefixes
    (groups[county] ??= []).push(value);
    if (code === selCode) { selCountyVal = value; }
  }

  return Object.entries(groups)
    .map(([countyCode, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const q1     = quantile(sorted, 0.25);
      const median = quantile(sorted, 0.5);
      const q3     = quantile(sorted, 0.75);
      const iqr    = q3 - q1;
      const lo     = q1 - 1.5 * iqr;
      const hi     = q3 + 1.5 * iqr;
      const lowerWhisker  = sorted.find(v => v >= lo) ?? sorted[0];
      const upperWhisker  = [...sorted].reverse().find(v => v <= hi) ?? sorted[sorted.length - 1];
      const outliers      = sorted.filter(v => v < lowerWhisker || v > upperWhisker);
      return {
        countyCode,
        countyName:    COUNTY_NAMES[countyCode] ?? countyCode,
        q1, median, q3,
        lowerWhisker, upperWhisker,
        outliers,
        count:         sorted.length,
        selectedValue: countyCode === selCounty ? selCountyVal : null,
      };
    })
    .sort((a, b) => b.median - a.median);
}

function fmtVal(v: number, unit: string): string {
  if (unit === '%' || Math.abs(v) < 100) { return d3.format('.1f')(v) + (unit ? ` ${unit}` : ''); }
  if (Math.abs(v) >= 1_000_000) { return d3.format('.2s')(v) + (unit ? ` ${unit}` : ''); }
  return d3.format(',.0f')(v) + (unit ? ` ${unit}` : '');
}

export const BoxPlot: React.FC<Props> = ({ data, colorScale, selectedFeature }) => {
  const { containerRef, svgRef, dimensions } = useChartBase();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const hoveredRowRef = useRef<SVGRectElement | null>(null);


  useEffect(() => {
    if (!svgRef.current || !dimensions) { return; }

    const selCode = selectedFeature?.code ?? null;
    const boxes   = buildStats(data, selCode);
    if (boxes.length === 0) { return; }

    const { width } = dimensions;
    const innerW    = width - MARGIN.left - MARGIN.right;
    const innerH    = boxes.length * ROW_H;
    const totalH    = innerH + MARGIN.top + MARGIN.bottom;

    if (innerW <= 0) { return; }

    const allVals = boxes.flatMap(b => [b.lowerWhisker, b.upperWhisker, ...b.outliers]);
    const [domMin, domMax] = d3.extent(allVals) as [number, number];
    const xScale = d3.scaleLinear()
      .domain([domMin, domMax])
      .range([0, innerW])
      .nice();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', totalH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // First pass: row backgrounds (drawn before grid lines so grid lines sit on top).
    boxes.forEach((b, i) => {
      const isSelCounty = b.countyCode === selCode?.slice(0, 2);
      if (i % 2 === 1) {
        g.append('rect')
          .attr('x', -MARGIN.left).attr('y', i * ROW_H)
          .attr('width', innerW + MARGIN.left).attr('height', ROW_H)
          .attr('fill', '#f9fafb').attr('pointer-events', 'none');
      }
      if (isSelCounty) {
        g.append('rect')
          .attr('x', -MARGIN.left).attr('y', i * ROW_H)
          .attr('width', innerW + MARGIN.left).attr('height', ROW_H)
          .attr('fill', '#eff6ff').attr('pointer-events', 'none');
      }
    });

    // Vertical grid lines — on top of row backgrounds.
    g.selectAll('line.vgrid')
      .data(xScale.ticks(5))
      .join('line')
      .attr('class', 'vgrid')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', CT.gridLine).attr('stroke-width', 1);

    drawChartFrame(g, innerW, innerH, {
      separatorCount: boxes.length - 1,
      separatorY: i => (i + 1) * ROW_H - 0.5,
      leftExtend: MARGIN.left,
    });

    // X axis.
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(5)
        .tickFormat(n => fmtVal(n.valueOf(), data.unit).replace(` ${data.unit}`, '')))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', CT.gridLine))
      .call(ax => ax.selectAll('text').attr('fill', CT.tickText).attr('font-size', 11));

    // X axis label.
    g.append('text')
      .attr('x', innerW / 2).attr('y', innerH + 40)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', CT.axisLabel)
      .text(`${data.label}${data.unit ? ` (${data.unit})` : ''}`);

    // Per-row rendering.
    boxes.forEach((b, i) => {
      const cy     = i * ROW_H + ROW_H / 2;
      const isSelCounty = b.countyCode === selCode?.slice(0, 2);
      const boxColor    = colorScale ? colorScale(b.median) : CT.defaultFill;

      const row = g.append('g').attr('class', 'box-row');

      // County name label.
      row.append('text')
        .attr('x', -8).attr('y', cy + 4)
        .attr('text-anchor', 'end')
        .attr('font-size', 11)
        .attr('font-weight', isSelCounty ? '700' : '400')
        .attr('fill', isSelCounty ? CT.selected : CT.labelText)
        .text(b.countyName);

      // Whisker line.
      row.append('line')
        .attr('x1', xScale(b.lowerWhisker)).attr('x2', xScale(b.upperWhisker))
        .attr('y1', cy).attr('y2', cy)
        .attr('stroke', '#94a3b8').attr('stroke-width', 1.5);

      // Whisker caps.
      for (const wx of [b.lowerWhisker, b.upperWhisker]) {
        row.append('line')
          .attr('x1', xScale(wx)).attr('x2', xScale(wx))
          .attr('y1', cy - 4).attr('y2', cy + 4)
          .attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
      }

      // IQR box.
      row.append('rect')
        .attr('x', xScale(b.q1))
        .attr('y', cy - BOX_H / 2)
        .attr('width', Math.max(1, xScale(b.q3) - xScale(b.q1)))
        .attr('height', BOX_H)
        .attr('fill', boxColor)
        .attr('fill-opacity', isSelCounty ? 0.85 : 0.55)
        .attr('stroke', boxColor)
        .attr('stroke-width', 1)
        .attr('rx', 2);

      // Median line.
      row.append('line')
        .attr('x1', xScale(b.median)).attr('x2', xScale(b.median))
        .attr('y1', cy - BOX_H / 2 - 1).attr('y2', cy + BOX_H / 2 + 1)
        .attr('stroke', 'white')
        .attr('stroke-width', 2);

      // Outlier dots.
      row.selectAll<SVGCircleElement, number>('circle.outlier')
        .data(b.outliers)
        .join('circle')
        .attr('class', 'outlier')
        .attr('cx', v => xScale(v))
        .attr('cy', cy)
        .attr('r', 2)
        .attr('fill', '#94a3b8')
        .attr('fill-opacity', 0.6)
        .attr('pointer-events', 'none');

      // Selected feature marker within its county.
      if (b.selectedValue !== null) {
        row.append('line')
          .attr('x1', xScale(b.selectedValue)).attr('x2', xScale(b.selectedValue))
          .attr('y1', cy - BOX_H / 2 - 3).attr('y2', cy + BOX_H / 2 + 3)
          .attr('stroke', CT.selected)
          .attr('stroke-width', 2.5)
          .attr('pointer-events', 'none');
      }

      // Row hover highlight (initially transparent).
      const hlRect = row.append('rect')
        .attr('x', -MARGIN.left).attr('y', i * ROW_H)
        .attr('width', innerW + MARGIN.left).attr('height', ROW_H)
        .attr('fill', '#000').attr('fill-opacity', 0)
        .attr('pointer-events', 'none');

      // Invisible hover target.
      row.append('rect')
        .attr('x', 0).attr('y', i * ROW_H)
        .attr('width', innerW).attr('height', ROW_H)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', (event: MouseEvent) => {
          const el = hlRect.node();
          if (el && hoveredRowRef.current !== el) {
            if (hoveredRowRef.current) { d3.select(hoveredRowRef.current).attr('fill-opacity', 0); }
            hoveredRowRef.current = el;
            d3.select(el).attr('fill-opacity', 0.04);
          }
          setHovered({ stats: b, clientX: event.clientX, clientY: event.clientY });
        })
        .on('mouseleave', () => {
          if (hoveredRowRef.current) {
            d3.select(hoveredRowRef.current).attr('fill-opacity', 0);
            hoveredRowRef.current = null;
          }
          setHovered(null);
        });
    });

  }, [data, colorScale, selectedFeature, dimensions, svgRef]);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg ref={svgRef} style={{ display: 'block' }} />
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg"
          style={{ left: hovered.clientX + 14, top: hovered.clientY - 10 }}
        >
          <div className="font-semibold mb-0.5">{hovered.stats.countyName}</div>
          <div className="text-gray-300">Median: <span className="text-white">{fmtVal(hovered.stats.median, data.unit)}</span></div>
          <div className="text-gray-300">IQR: <span className="text-white">{fmtVal(hovered.stats.q1, data.unit)} – {fmtVal(hovered.stats.q3, data.unit)}</span></div>
          <div className="text-gray-400 mt-0.5">{hovered.stats.count} områden · {hovered.stats.outliers.length} extremvärden</div>
          {hovered.stats.selectedValue !== null && (
            <div className="text-blue-300 mt-0.5">
              {selectedFeature?.label}: {fmtVal(hovered.stats.selectedValue, data.unit)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
