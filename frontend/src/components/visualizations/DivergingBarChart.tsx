import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { stripCommonPrefix, stripLanSuffix, stripOrphanParens, stripOuterParens } from '@/utils/labelFormatting';

interface Hovered { name: string; value: number; deviation: number; x: number; y: number; }

interface Props {
  data: DatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
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

export const DivergingBarChart: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  const hoveredElRef = useRef<SVGRectElement | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  // Sort descending by value (highest at top — e.g. oldest counties first).
  const sorted = useMemo(() => {
    const raw = Object.entries(data.values)
      .map(([code, value]) => ({ code, value, name: stripLanSuffix(data.labels[code] ?? code) }))
      .filter(d => Number.isFinite(d.value))
      .sort((a, b) => b.value - a.value);
    const stripped = stripCommonPrefix(raw.map(d => d.name)).map(stripOuterParens).map(stripOrphanParens);
    return raw.map((d, i) => ({ ...d, name: stripped[i] }));
  }, [data.values, data.labels]);

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

    // Cap the domain at the 90th-percentile deviation × 1.5 so a single outlier
    // (e.g. Stockholm at Region level) doesn't compress all other bars. Bars
    // that exceed the domain are clipped; their labels are clamped to the edge.
    const sortedDevs = sorted.map(d => Math.abs(d.value - mean)).sort(d3.ascending);
    const p90Dev     = d3.quantile(sortedDevs, 0.9) ?? maxDev;
    const extent     = Math.min(p90Dev * 1.5, maxDev * 1.1);

    // Symmetric domain centred on mean.
    const xScale = d3.scaleLinear()
      .domain([mean - extent, mean + extent])
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

    // Vertical grid lines at x-axis tick positions — drawn first so they sit behind bars.
    g.append('g')
      .attr('transform', `translate(0,${vOffset})`)
      .call(d3.axisBottom(xScale).ticks(5).tickSize(effH).tickFormat(() => ''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb').attr('stroke-width', 1));

    // Subtle horizontal stripe at every other bar for readability.
    g.selectAll('rect.stripe')
      .data(sorted.filter((_, i) => i % 2 === 0))
      .join('rect').attr('class', 'stripe')
      .attr('x', 0).attr('width', innerW)
      .attr('y',      d => yScale(d.code)! - BAR_GAP / 2)
      .attr('height', yScale.bandwidth() + BAR_GAP)
      .attr('fill', '#f8fafc').attr('stroke', 'none');

    // Clip bars to the plot area so outliers don't overflow into the margins.
    const clipId = 'diverging-bars-clip';
    svg.append('defs')
      .append('clipPath').attr('id', clipId)
      .append('rect')
        .attr('x', MARGIN.left).attr('y', 0)
        .attr('width', innerW)
        .attr('height', Math.max(height, needed + MARGIN.top + MARGIN.bottom));

    // Bars (inside clipped group).
    g.append('g').attr('clip-path', `url(#${clipId})`)
      .selectAll<SVGRectElement, typeof sorted[0]>('rect.bar')
      .data(sorted)
      .join('rect').attr('class', 'bar')
      .attr('x',      d => Math.min(xScale(d.value), center))
      .attr('y',      d => yScale(d.code)!)
      .attr('width',  d => Math.max(1, Math.abs(xScale(d.value) - center)))
      .attr('height', yScale.bandwidth())
      .attr('rx', BAR_RADIUS)
      .attr('fill',   d => d.value >= mean ? COLOR_ABOVE : COLOR_BELOW)
      .attr('stroke', d => d.code === selectedFeature?.code ? '#1e293b' : '#000')
      .attr('stroke-width', d => d.code === selectedFeature?.code ? 2 : 0.5)
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d) => {
        onFeatureSelect?.(d.code === selectedFeature?.code ? null : { code: d.code, label: d.name });
      })
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
        const tipX = xScale(d.value);
        if (d.value >= mean) { return Math.min(tipX + 5, innerW - 4); }
        return Math.max(tipX - 5, 4);
      })
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => {
        if (d.value >= mean) { return xScale(d.value) > innerW ? 'end' : 'start'; }
        return xScale(d.value) < 0 ? 'start' : 'end';
      })
      .attr('font-size', 10).attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(d => fmtDev(d.value - mean, data.unit));

    // Y-axis — names, truncated with getComputedTextLength.
    const nameByCode = new Map(sorted.map(d => [d.code, d.name]));
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(8)
        .tickFormat(code => nameByCode.get(code) ?? code))
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

    // Scroll the selected bar into view.
    if (selectedFeature && containerRef.current) {
      const idx = sorted.findIndex(d => d.code === selectedFeature.code);
      if (idx >= 0) {
        const barCenterY = MARGIN.top + yScale(sorted[idx].code)! + yScale.bandwidth() / 2;
        containerRef.current.scrollTop = barCenterY - containerRef.current.clientHeight / 2;
      }
    }
  }, [sorted, mean, needed, n, dimensions, data.unit, data.labels, selectedFeature, onFeatureSelect]);

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
