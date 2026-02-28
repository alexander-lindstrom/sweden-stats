import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';

interface Hovered { name: string; value: number; deviation: number; x: number; y: number; }

interface Props {
  data: DatasetResult;
}

const MARGIN     = { top: 28, right: 76, bottom: 24, left: 152 };
const MAX_BAR_H  = 20;
const BAR_GAP    = 1;
const BAR_RADIUS = 2;

// Below-mean → blue, above-mean → orange
const COLOR_BELOW = '#60a5fa';
const COLOR_ABOVE = '#fb923c';

function fmtDev(dev: number, unit: string): string {
  const sign = dev >= 0 ? '+' : '−'; // proper minus sign
  return `${sign}${Math.abs(dev).toFixed(1)} ${unit}`;
}

function fmtAbs(v: number): string {
  if (v >= 1_000_000) {return `${(v / 1_000_000).toFixed(1)}M`;}
  if (v >= 1_000)     {return `${(v / 1_000).toFixed(0)}k`;}
  return v.toFixed(1);
}

export const DivergingBarChart: React.FC<Props> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  const hoveredElRef = useRef<SVGRectElement | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  // Sort descending by value (highest at top — e.g. oldest counties first).
  const sorted = useMemo(() =>
    Object.entries(data.values)
      .map(([code, value]) => ({ code, value, name: data.labels[code] ?? code }))
      .filter(d => Number.isFinite(d.value))
      .sort((a, b) => b.value - a.value),
    [data.values, data.labels],
  );

  const mean = d3.mean(sorted, d => d.value) ?? 0;

  // Fixed bar height with vertical centering, same approach as SunburstWithBar.
  const n       = sorted.length;
  const needed  = n * MAX_BAR_H + Math.max(n - 1, 0) * BAR_GAP;

  useEffect(() => {
    if (!svgRef.current || !dimensions || sorted.length === 0) {return;}

    const { width, height } = dimensions;
    const innerW = width  - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top  - MARGIN.bottom;
    if (innerW <= 0 || innerH <= 0) {return;}

    const effH    = Math.min(innerH, needed);
    const vOffset = (innerH - effH) / 2;
    const padding = n > 1 ? BAR_GAP / MAX_BAR_H : 0;

    const maxDev = d3.max(sorted, d => Math.abs(d.value - mean)) ?? 1;

    // Symmetric domain centred on mean.
    const xScale = d3.scaleLinear()
      .domain([mean - maxDev * 1.1, mean + maxDev * 1.1])
      .range([0, innerW]);

    const center = xScale(mean);

    const yScale = d3.scaleBand<string>()
      .domain(sorted.map(d => d.code))
      .range([vOffset, vOffset + effH])
      .paddingInner(padding);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('width',  width)
      .attr('height', Math.max(height, needed + MARGIN.top + MARGIN.bottom));

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Subtle horizontal grid at every other bar for readability.
    g.selectAll('line.stripe')
      .data(sorted.filter((_, i) => i % 2 === 0))
      .join('line').attr('class', 'stripe')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yScale(d.code)! - BAR_GAP / 2)
      .attr('y2', d => yScale(d.code)! + yScale.bandwidth() + BAR_GAP / 2)
      .attr('fill', '#f9fafb').attr('stroke', 'none');

    // Bars.
    g.selectAll<SVGRectElement, typeof sorted[0]>('rect.bar')
      .data(sorted)
      .join('rect').attr('class', 'bar')
      .attr('x',      d => Math.min(xScale(d.value), center))
      .attr('y',      d => yScale(d.code)!)
      .attr('width',  d => Math.max(1, Math.abs(xScale(d.value) - center)))
      .attr('height', yScale.bandwidth())
      .attr('rx', BAR_RADIUS)
      .attr('fill',   d => d.value >= mean ? COLOR_ABOVE : COLOR_BELOW)
      .attr('stroke', '#000').attr('stroke-width', 0.5)
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
        setHovered({ name: d.name, value: d.value, deviation: d.value - mean, x: event.clientX, y: event.clientY });
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
        if (!(event.target as Element).classList?.contains('bar') && hoveredElRef.current !== null) {
          clearHighlight();
        }
      })
      .on('mouseleave', () => { if (hoveredElRef.current !== null) { clearHighlight(); } });

    // Mean axis line — drawn after bars so it sits on top.
    g.append('line')
      .attr('x1', center).attr('x2', center)
      .attr('y1', vOffset).attr('y2', vOffset + effH)
      .attr('stroke', '#374151').attr('stroke-width', 1.5);

    // Mean label at top of axis line.
    g.append('text')
      .attr('x', center).attr('y', vOffset - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', '#374151').attr('font-weight', '500')
      .text(`↕ medel ${fmtAbs(mean)} ${data.unit}`);

    // Deviation labels (right of each bar).
    g.selectAll<SVGTextElement, typeof sorted[0]>('text.dev')
      .data(sorted)
      .join('text').attr('class', 'dev')
      .attr('x', d => {
        const barEnd = d.value >= mean ? xScale(d.value) : xScale(d.value);
        return d.value >= mean ? barEnd + 5 : Math.min(xScale(d.value), center) - 5;
      })
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.value >= mean ? 'start' : 'end')
      .attr('font-size', 10).attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(d => fmtDev(d.value - mean, data.unit));

    // Y-axis — names, truncated with getComputedTextLength.
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(8)
        .tickFormat(code => data.labels[code] ?? code))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll<SVGTextElement, string>('text')
        .attr('font-size', 12).attr('fill', '#374151')
        .each(function() {
          const el  = this as SVGTextElement;
          const max = MARGIN.left - 16;
          if (el.getComputedTextLength() <= max) {return;}
          let t = el.textContent ?? '';
          while (t.length > 2 && el.getComputedTextLength() > max) {
            t = t.slice(0, -1);
            el.textContent = t + '…';
          }
        }));

    // X-axis — show a few absolute value ticks.
    g.append('g')
      .attr('transform', `translate(0,${vOffset + effH + 4})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(n => fmtAbs(n.valueOf())))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 10));

  }, [sorted, mean, needed, n, dimensions, data.unit, data.labels]);

  const svgH = Math.max(dimensions?.height ?? 0, needed + MARGIN.top + MARGIN.bottom);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto">
      <svg ref={svgRef} style={{ height: svgH }} />
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg"
          style={{ left: hovered.x + 14, top: hovered.y - 10 }}
        >
          <div className="font-semibold">{hovered.name}</div>
          <div className="text-gray-300">{hovered.value.toLocaleString('sv-SE')} {data.unit}</div>
          <div className="text-gray-400">{fmtDev(hovered.deviation, data.unit)} från medel</div>
        </div>
      )}
    </div>
  );
};
