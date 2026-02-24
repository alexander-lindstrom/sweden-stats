import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import { Tooltip } from '@/components/ui/Tooltip';
import useResizeObserver from '@/hooks/useResizeObserver';

interface HistogramProps {
  data: DatasetResult;
  colorScale?: ((v: number) => string) | null;
}

interface TooltipState {
  x: number;
  y: number;
  visible: boolean;
  content: string[];
}

const MARGIN   = { top: 16, right: 24, bottom: 36, left: 52 };
const NUM_BINS = 15;

function formatValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

export const Histogram: React.FC<HistogramProps> = ({ data, colorScale }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);

  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, visible: false, content: [] });

  const entries = Object.entries(data.values)
    .map(([code, value]) => ({ code, value, name: data.labels[code] ?? code }))
    .filter(d => Number.isFinite(d.value));

  useEffect(() => {
    if (!svgRef.current || !dimensions || entries.length === 0) return;

    const { width, height } = dimensions;
    const innerW = width  - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top  - MARGIN.bottom;

    if (innerW <= 0 || innerH <= 0) return;

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
        if (!colorScale) return '#3b82f6';
        const mid = ((d.x0 ?? 0) + (d.x1 ?? 0)) / 2;
        return colorScale(mid);
      })
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5)
      .on('mousemove', (event, d) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const names = d.slice(0, 5).map(e => e.name);
        const more  = d.length > 5 ? [`+${d.length - 5} till`] : [];
        const range = `${formatValue(d.x0 ?? 0)} – ${formatValue(d.x1 ?? 0)} ${data.unit}`;
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          visible: true,
          content: [range, `${d.length} kommuner`, ...names, ...more],
        });
      })
      .on('mouseleave', () => {
        setTooltip(t => ({ ...t, visible: false }));
      });

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

  }, [entries, dimensions, colorScale, data.label, data.unit]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <Tooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
        {tooltip.content.map((line, i) => (
          <div key={i} className={i === 0 ? 'font-medium' : i === 1 ? 'text-gray-400 mb-1' : 'text-gray-300'}>
            {line}
          </div>
        ))}
      </Tooltip>
    </div>
  );
};
