import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ScalarDatasetResult } from '@/datasets/types';
import { useChartBase } from '@/hooks/useChartBase';
import { CT } from './chartTokens';

interface Props {
  xData: ScalarDatasetResult;
  yData: ScalarDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
  comparisonFeature?: { code: string; label: string } | null;
  onComparisonSelect?: (f: { code: string; label: string } | null) => void;
}

interface Point {
  code:       string;
  label:      string;
  x:          number;
  y:          number;
  countyCode: string;
}

interface Hovered {
  point:   Point;
  clientX: number;
  clientY: number;
}

const MARGIN_BASE = { top: 20, right: 24, left: 64 };

// Stable county-index palette — same county always gets the same colour.
const COUNTY_CODES = [
  '01','03','04','05','06','07','08','09','10',
  '12','13','14','17','18','19','20','21','22','23','24','25',
];

const PALETTE = [
  ...d3.schemeTableau10,
  '#e377c2','#bcbd22','#17becf','#aec7e8','#ffbb78','#98df8a',
];

function countyColor(code: string): string {
  const idx = COUNTY_CODES.indexOf(code);
  return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
}

function fmt(v: number, unit: string): string {
  if (unit === '%' || Math.abs(v) < 100) { return d3.format('.1f')(v); }
  if (Math.abs(v) >= 1_000_000) { return `${(v / 1_000_000).toFixed(1)}M`; }
  if (Math.abs(v) >= 1_000)     { return `${Math.round(v / 1_000)}k`; }
  return String(Math.round(v));
}

export const ScatterPlot: React.FC<Props> = ({ xData, yData, selectedFeature, onFeatureSelect, comparisonFeature, onComparisonSelect }) => {
  const { containerRef, svgRef, dimensions } = useChartBase();
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const onFeatureSelectRef    = useRef(onFeatureSelect);
  onFeatureSelectRef.current  = onFeatureSelect;
  const onComparisonSelectRef = useRef(onComparisonSelect);
  onComparisonSelectRef.current = onComparisonSelect;

  useEffect(() => {
    if (!svgRef.current || !dimensions) { return; }

    const { width, height } = dimensions;
    const rotateLabels = width < 600;
    const MARGIN = { ...MARGIN_BASE, bottom: rotateLabels ? 72 : 52 };
    const innerW = width  - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top  - MARGIN.bottom;
    if (innerW <= 0 || innerH <= 0) { return; }

    // Build points — only areas present in both datasets.
    const points: Point[] = [];
    for (const [code, xVal] of Object.entries(xData.values)) {
      const yVal = yData.values[code];
      if (yVal === undefined || !Number.isFinite(xVal) || !Number.isFinite(yVal)) { continue; }
      points.push({
        code,
        label:      xData.labels[code] ?? code,
        x:          xVal,
        y:          yVal,
        countyCode: code.slice(0, 2),
      });
    }

    if (points.length === 0) { return; }

    const [xMin, xMax] = d3.extent(points, p => p.x) as [number, number];
    const [yMin, yMax] = d3.extent(points, p => p.y) as [number, number];

    // Use a log scale when the range spans more than ~30× and all values are
    // strictly positive (e.g. population: 3 000 → 1 000 000).
    const useLogX = xMin > 0 && xMax / xMin > 30;
    const useLogY = yMin > 0 && yMax / yMin > 30;

    // Keep scale as a plain function for cx/cy positioning; build the D3 axis
    // inline with the correctly typed scale to avoid unsafe casts.
    let xFn: (v: number) => number;
    let yFn: (v: number) => number;
    let xAxisDef: d3.Axis<d3.NumberValue>;
    let yAxisDef: d3.Axis<d3.NumberValue>;
    let xTickVals: number[];
    let yTickVals: number[];
    const xTickFmt = (n: d3.NumberValue) => fmt(n.valueOf(), xData.unit);
    const yTickFmt = (n: d3.NumberValue) => fmt(n.valueOf(), yData.unit);

    // For log scales filter to 1×/2×/5× per decade — avoids crowding.
    const sparseLogTicks = (ticks: number[]) => ticks.filter(v => {
      const b = Math.pow(10, Math.floor(Math.log10(v)));
      const r = Math.round(v / b);
      return r === 1 || r === 2 || r === 5;
    });

    const xTickCount = Math.max(3, Math.floor(innerW / 80));
    if (useLogX) {
      const s = d3.scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();
      xTickVals = sparseLogTicks(s.ticks());
      xFn = s; xAxisDef = d3.axisBottom(s).tickValues(xTickVals).tickFormat(xTickFmt);
    } else {
      const s = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]).nice();
      xTickVals = s.ticks(xTickCount);
      xFn = s; xAxisDef = d3.axisBottom(s).ticks(xTickCount).tickFormat(xTickFmt);
    }
    if (useLogY) {
      const s = d3.scaleLog().domain([yMin, yMax]).range([innerH, 0]).nice();
      yTickVals = s.ticks(5);
      yFn = s; yAxisDef = d3.axisLeft(s).ticks(5).tickFormat(yTickFmt);
    } else {
      const s = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]).nice();
      yTickVals = s.ticks(5);
      yFn = s; yAxisDef = d3.axisLeft(s).ticks(5).tickFormat(yTickFmt);
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Grid lines.
    g.selectAll('line.hgrid')
      .data(yTickVals)
      .join('line')
      .attr('class', 'hgrid')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yFn(d)).attr('y2', d => yFn(d))
      .attr('stroke', CT.gridLine).attr('stroke-width', 1);

    g.selectAll('line.vgrid')
      .data(xTickVals)
      .join('line')
      .attr('class', 'vgrid')
      .attr('x1', d => xFn(d)).attr('x2', d => xFn(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', CT.gridLine).attr('stroke-width', 1);

    // Axes.
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxisDef)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', CT.gridLine))
      .call(ax => ax.selectAll<SVGTextElement, unknown>('text')
        .attr('fill', CT.tickText).attr('font-size', 11)
        .attr('text-anchor', rotateLabels ? 'end' : 'middle')
        .attr('transform', rotateLabels ? 'rotate(-45) translate(-4, 0)' : null));

    g.append('g')
      .call(yAxisDef)
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', CT.gridLine))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 11));

    // Axis labels.
    g.append('text')
      .attr('x', innerW / 2).attr('y', innerH + MARGIN.bottom - 10)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', CT.axisLabel)
      .text(`${xData.label}${xData.unit ? ` (${xData.unit})` : ''}`);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -50)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', CT.axisLabel)
      .text(`${yData.label}${yData.unit ? ` (${yData.unit})` : ''}`);

    // Dot radius and opacity — smaller dots need higher opacity to stay visible.
    const r       = points.length > 3000 ? 2   : points.length > 500 ? 3   : 5;
    const opacity = points.length > 3000 ? 0.8 : points.length > 500 ? 0.7 : 0.65;

    const selCode = selectedFeature?.code;

    // Non-selected points.
    g.selectAll<SVGCircleElement, Point>('circle.pt')
      .data(points.filter(p => p.code !== selCode))
      .join('circle')
      .attr('class', 'pt')
      .attr('cx', p => xFn(p.x))
      .attr('cy', p => yFn(p.y))
      .attr('r', r)
      .attr('fill', p => countyColor(p.countyCode))
      .attr('fill-opacity', opacity)
      .attr('stroke', 'none')
      .attr('pointer-events', 'none');

    // Selected feature on top.
    const selPoint = selCode ? points.find(p => p.code === selCode) : null;
    if (selPoint) {
      g.append('circle')
        .attr('cx', xFn(selPoint.x)).attr('cy', yFn(selPoint.y))
        .attr('r', r + 3)
        .attr('fill', '#1d4ed8').attr('stroke', 'white').attr('stroke-width', 1.5)
        .attr('pointer-events', 'none');

      // Label the selected point.
      const lx = xFn(selPoint.x);
      const ly = yFn(selPoint.y);
      const labelRight = lx < innerW * 0.75;
      g.append('text')
        .attr('x', lx + (labelRight ? r + 6 : -(r + 6)))
        .attr('y', ly + 4)
        .attr('text-anchor', labelRight ? 'start' : 'end')
        .attr('font-size', 11)
        .attr('font-weight', '600')
        .attr('fill', '#1d4ed8')
        .attr('pointer-events', 'none')
        .text(selPoint.label);
    }

    // Comparison feature point.
    const cmpPoint = comparisonFeature ? points.find(p => p.code === comparisonFeature.code) : null;
    if (cmpPoint) {
      g.append('circle')
        .attr('cx', xFn(cmpPoint.x)).attr('cy', yFn(cmpPoint.y))
        .attr('r', r + 3)
        .attr('fill', '#f97316').attr('stroke', 'white').attr('stroke-width', 1.5)
        .attr('pointer-events', 'none');

      const lx = xFn(cmpPoint.x);
      const ly = yFn(cmpPoint.y);
      const labelRight = lx < innerW * 0.75;
      g.append('text')
        .attr('x', lx + (labelRight ? r + 6 : -(r + 6)))
        .attr('y', ly + 4)
        .attr('text-anchor', labelRight ? 'start' : 'end')
        .attr('font-size', 11)
        .attr('font-weight', '600')
        .attr('fill', '#f97316')
        .attr('pointer-events', 'none')
        .text(cmpPoint.label);
    }

    // Hover ring (hidden initially).
    const hoverRing = g.append('circle')
      .attr('r', r + 3)
      .attr('fill', 'none')
      .attr('stroke', '#374151')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none')
      .attr('visibility', 'hidden');

    // Delaunay for efficient nearest-point lookup.
    const delaunay = d3.Delaunay.from(points, p => xFn(p.x), p => yFn(p.y));

    // Invisible overlay for mouse events.
    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event);
        const idx = delaunay.find(mx, my);
        if (idx < 0) { return; }
        const pt = points[idx];
        hoverRing
          .attr('cx', xFn(pt.x)).attr('cy', yFn(pt.y))
          .attr('visibility', 'visible');
        setHovered({ point: pt, clientX: event.clientX, clientY: event.clientY });
      })
      .on('mouseleave', () => {
        hoverRing.attr('visibility', 'hidden');
        setHovered(null);
      })
      .on('click', (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event);
        const idx = delaunay.find(mx, my);
        if (idx < 0) { return; }
        const pt = points[idx];
        if (event.shiftKey) {
          onComparisonSelectRef.current?.({ code: pt.code, label: pt.label });
        } else {
          onFeatureSelectRef.current?.({ code: pt.code, label: pt.label });
        }
      });

  }, [xData, yData, dimensions, selectedFeature, comparisonFeature, svgRef]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg"
          style={{ left: hovered.clientX + 14, top: hovered.clientY - 10 }}
        >
          <div className="font-semibold mb-0.5">{hovered.point.label}</div>
          <div className="text-gray-300">
            {xData.label}: <span className="text-white">{fmt(hovered.point.x, xData.unit)}{xData.unit ? ` ${xData.unit}` : ''}</span>
          </div>
          <div className="text-gray-300">
            {yData.label}: <span className="text-white">{fmt(hovered.point.y, yData.unit)}{yData.unit ? ` ${yData.unit}` : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
};
