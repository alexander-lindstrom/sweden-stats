import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { stripCommonPrefix, stripLanSuffix, stripOuterParens } from '@/utils/labelFormatting';

interface HistogramProps {
  data: DatasetResult;
  colorScale?: ((v: number) => string) | null;
}

interface Hovered {
  x0: number; x1: number;
  count: number; names: string[]; more: number;
  x: number; y: number;
}

const MARGIN   = { top: 16, right: 24, bottom: 36, left: 52 };
const NUM_BINS = 15;

function formatValue(v: number): string {
  if (v >= 1_000_000) {return `${(v / 1_000_000).toFixed(1)}M`;}
  if (v >= 1_000)     {return `${(v / 1_000).toFixed(0)}k`;}
  return String(Math.round(v));
}

export const Histogram: React.FC<HistogramProps> = ({ data, colorScale }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  const hoveredElRef = useRef<SVGRectElement | null>(null);

  const [hovered, setHovered] = useState<Hovered | null>(null);

  const entries = useMemo(() => {
    const raw = Object.entries(data.values)
      .map(([code, value]) => ({ code, value, name: stripLanSuffix(data.labels[code] ?? code) }))
      .filter(d => Number.isFinite(d.value));
    const stripped = stripCommonPrefix(raw.map(d => d.name)).map(stripOuterParens);
    return raw.map((d, i) => ({ ...d, name: stripped[i] }));
  }, [data.values, data.labels]);

  useEffect(() => {
    if (!svgRef.current || !dimensions || entries.length === 0) {return;}

    const { width, height } = dimensions;
    const innerW = width  - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top  - MARGIN.bottom;

    if (innerW <= 0 || innerH <= 0) {return;}

    const values = entries.map(d => d.value);
    const [minVal, maxVal] = d3.extent(values) as [number, number];

    const xScale = d3.scaleLinear().domain([minVal, maxVal]).range([0, innerW]).nice();

    const binner = d3.bin<{ code: string; value: number; name: string }, number>()
      .value(d => d.value)
      .domain(xScale.domain() as [number, number])
      .thresholds(xScale.ticks(NUM_BINS));

    const bins = binner(entries);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length) ?? 1])
      .range([innerH, 0])
      .nice();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Vertical grid lines.
    g.selectAll('line.grid')
      .data(yScale.ticks(5))
      .join('line')
      .attr('class', 'grid')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#f3f4f6')
      .attr('stroke-width', 1);

    // Bars.
    g.selectAll<SVGRectElement, d3.Bin<{ code: string; value: number; name: string }, number>>('rect.bin')
      .data(bins)
      .join('rect')
      .attr('class', 'bin')
      .attr('x', d => xScale(d.x0!) + 1)
      .attr('y', d => yScale(d.length))
      .attr('width', d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 2))
      .attr('height', d => innerH - yScale(d.length))
      .attr('rx', 2)
      .attr('fill', d => {
        if (!colorScale) {return '#3b82f6';}
        const mid = ((d.x0 ?? 0) + (d.x1 ?? 0)) / 2;
        return colorScale(mid);
      })
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent, d) => {
        const el = event.currentTarget as SVGRectElement;
        if (hoveredElRef.current !== el) {
          if (hoveredElRef.current) {
            d3.select(hoveredElRef.current).attr('fill-opacity', 1);
          }
          hoveredElRef.current = el;
          d3.select(el).attr('fill-opacity', 0.6);
        }
        setHovered({
          x0: d.x0 ?? 0, x1: d.x1 ?? 0,
          count: d.length,
          names: d.slice(0, 5).map(e => e.name),
          more:  Math.max(0, d.length - 5),
          x: event.clientX, y: event.clientY,
        });
      });

    const clearHighlight = () => {
      if (hoveredElRef.current) {
        d3.select(hoveredElRef.current).attr('fill-opacity', 1);
        hoveredElRef.current = null;
      }
      setHovered(null);
    };
    d3.select(svgRef.current)
      .on('mousemove.clear', (event: MouseEvent) => {
        if (!(event.target as Element).classList?.contains('bin') && hoveredElRef.current !== null) {
          clearHighlight();
        }
      })
      .on('mouseleave', () => { if (hoveredElRef.current !== null) { clearHighlight(); } });

    // X axis.
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(6)
          .tickFormat(n => formatValue(n.valueOf()))
      )
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 11));

    // X axis label.
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#6b7280')
      .text(data.label + (data.unit ? ` (${data.unit})` : ''));

    // Y axis.
    g.append('g')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickFormat(n => String(n.valueOf()))
      )
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 11));

    // Y axis label.
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -38)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#6b7280')
      .text('Antal');

  }, [entries, dimensions, colorScale, data.label, data.unit]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg"
          style={{ left: hovered.x + 14, top: hovered.y - 10 }}
        >
          <div className="font-semibold">
            {formatValue(hovered.x0)} – {formatValue(hovered.x1)} {data.unit}
          </div>
          <div className="text-gray-400 mb-1">{hovered.count} områden</div>
          {hovered.names.map((n, i) => (
            <div key={i} className="text-gray-300">{n}</div>
          ))}
          {hovered.more > 0 && (
            <div className="text-gray-400">+{hovered.more} till</div>
          )}
        </div>
      )}
    </div>
  );
};
