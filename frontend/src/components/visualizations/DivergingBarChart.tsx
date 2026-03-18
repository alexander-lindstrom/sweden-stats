import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ScalarDatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { stripCommonPrefix, stripLanSuffix, stripOrphanParens, stripOuterParens } from '@/utils/labelFormatting';

interface Hovered { name: string; value: number; x: number; y: number; }

interface Props {
  data: ScalarDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
  comparisonFeature?: { code: string; label: string } | null;
  onComparisonSelect?: (f: { code: string; label: string } | null) => void;
}

const MARGIN     = { top: 20, right: 8, bottom: 28, left: 152 };
const MAX_BAR_H  = 20;
const BAR_GAP    = 1;
const BAR_RADIUS = 2;

const COLOR_BELOW = '#60a5fa';
const COLOR_ABOVE = '#fb923c';

function fmtVal(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) { return `${sign}${(abs / 1_000_000).toFixed(1)}M`; }
  if (abs >= 1_000)     { return `${sign}${(abs / 1_000).toFixed(0)}k`; }
  return v.toFixed(1);
}

export const DivergingBarChart: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect, comparisonFeature, onComparisonSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  const hoveredElRef = useRef<SVGRectElement | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  // Sort descending by value (highest at top).
  const sorted = useMemo(() => {
    const raw = Object.entries(data.values)
      .map(([code, value]) => ({ code, value, name: stripLanSuffix(data.labels[code] ?? code) }))
      .filter(d => Number.isFinite(d.value))
      .sort((a, b) => b.value - a.value);
    const stripped = stripCommonPrefix(raw.map(d => d.name)).map(stripOuterParens).map(stripOrphanParens);
    return raw.map((d, i) => ({ ...d, name: stripped[i] }));
  }, [data.values, data.labels]);

  const mean   = d3.mean(sorted, d => d.value) ?? 0;
  const n      = sorted.length;
  // SVG is sized to content — no wasted vertical space.
  const needed = n * MAX_BAR_H + Math.max(n - 1, 0) * BAR_GAP;

  useEffect(() => {
    if (!svgRef.current || !dimensions || sorted.length === 0) { return; }

    const { width } = dimensions;
    const margin = {
      top:    MARGIN.top,
      bottom: MARGIN.bottom,
      left:   width < 500 ? 90 : width < 700 ? 120 : 152,
      right:  width < 500 ? 56 : 76,
    };
    const innerW  = width - margin.left - margin.right;
    const innerH  = needed;
    if (innerW <= 0 || innerH <= 0) { return; }

    const svgHeight = innerH + margin.top + margin.bottom;
    const padding   = n > 1 ? BAR_GAP / MAX_BAR_H : 0;
    const tickCount = Math.max(2, Math.floor(innerW / 80));

    const maxDev = d3.max(sorted, d => Math.abs(d.value - mean)) ?? 1;
    const xScale = d3.scaleLinear()
      .domain([mean - maxDev * 1.1, mean + maxDev * 1.1])
      .range([0, innerW])
      .nice();

    const center = xScale(mean);

    const yScale = d3.scaleBand<string>()
      .domain(sorted.map(d => d.code))
      .range([0, innerH])
      .paddingInner(padding);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', svgHeight)
       .attr('font-family', 'system-ui, sans-serif');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Vertical grid lines — behind everything.
    g.append('g')
      .call(d3.axisBottom(xScale).ticks(tickCount).tickSize(innerH).tickFormat(() => ''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb').attr('stroke-width', 1));

    // Top border spanning label + chart area.
    g.append('line')
      .attr('x1', -margin.left).attr('x2', innerW)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#d1d5db').attr('stroke-width', 1);

    // Horizontal separators between each row.
    if (n > 1) {
      g.selectAll('line.sep')
        .data(d3.range(n - 1))
        .join('line').attr('class', 'sep')
        .attr('x1', -margin.left).attr('x2', innerW)
        .attr('y1', i => yScale(sorted[i + 1].code)! - 0.5)
        .attr('y2', i => yScale(sorted[i + 1].code)! - 0.5)
        .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5);
    }

    // Bottom border.
    g.append('line')
      .attr('x1', -margin.left).attr('x2', innerW)
      .attr('y1', innerH).attr('y2', innerH)
      .attr('stroke', '#d1d5db').attr('stroke-width', 1);

    // Vertical shelf line at label/chart boundary.
    g.append('line')
      .attr('x1', 0).attr('x2', 0)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#d1d5db').attr('stroke-width', 1);

    // Clip bars to the chart area.
    const clipId = 'diverging-bars-clip';
    svg.append('defs')
      .append('clipPath').attr('id', clipId)
      .append('rect').attr('x', 0).attr('y', 0).attr('width', innerW).attr('height', svgHeight);

    // Bars.
    g.append('g').attr('clip-path', `url(#${clipId})`)
      .selectAll<SVGRectElement, typeof sorted[0]>('rect.bar')
      .data(sorted)
      .join('rect').attr('class', 'bar')
      .attr('x',      d => Math.min(xScale(d.value), center))
      .attr('y',      d => yScale(d.code)!)
      .attr('width',  d => Math.max(1, Math.abs(xScale(d.value) - center)))
      .attr('height', yScale.bandwidth())
      .attr('rx', BAR_RADIUS)
      .attr('fill', d => d.value >= mean ? COLOR_ABOVE : COLOR_BELOW)
      .attr('stroke', d =>
        d.code === comparisonFeature?.code ? '#f97316'
          : d.code === selectedFeature?.code ? '#1e293b'
          : '#000'
      )
      .attr('stroke-width', d =>
        d.code === comparisonFeature?.code || d.code === selectedFeature?.code ? 2 : 0.5
      )
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d) => {
        if (event.shiftKey) {
          onComparisonSelect?.(d.code === comparisonFeature?.code ? null : { code: d.code, label: d.name });
        } else {
          onFeatureSelect?.(d.code === selectedFeature?.code ? null : { code: d.code, label: d.name });
        }
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const el = event.currentTarget as SVGRectElement;
        if (hoveredElRef.current !== el) {
          if (hoveredElRef.current) { d3.select(hoveredElRef.current).attr('fill-opacity', 1); }
          hoveredElRef.current = el;
          d3.select(el).attr('fill-opacity', 0.6);
        }
        setHovered({ name: d.name, value: d.value, x: event.clientX, y: event.clientY });
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

    // Mean line — on top of bars, extending into the top margin for the label.
    g.append('line')
      .attr('x1', center).attr('x2', center)
      .attr('y1', -8).attr('y2', innerH)
      .attr('stroke', '#374151').attr('stroke-width', 1.5);

    // "Medel" label above the mean line.
    g.append('text')
      .attr('x', center)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#6b7280')
      .text('Medel');

    // Y-axis labels — active rows rendered darker and slightly bolder.
    const nameByCode = new Map(sorted.map(d => [d.code, d.name]));
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(8)
        .tickFormat(code => nameByCode.get(code) ?? code))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll<SVGTextElement, string>('text')
        .attr('font-size', 11)
        .attr('fill', code =>
          code === selectedFeature?.code || code === comparisonFeature?.code ? '#111827' : '#6b7280'
        )
        .attr('font-weight', code =>
          code === selectedFeature?.code || code === comparisonFeature?.code ? '500' : '400'
        )
        .each(function() {
          const el  = this as SVGTextElement;
          const max = margin.left - 16;
          if (el.getComputedTextLength() <= max) { return; }
          let t = el.textContent ?? '';
          while (t.length > 2 && el.getComputedTextLength() > max) {
            t = t.slice(0, -1);
            el.textContent = t + '…';
          }
        }));

    // X-axis at the bottom of the bars.
    g.append('g')
      .attr('transform', `translate(0,${innerH + 4})`)
      .call(d3.axisBottom(xScale).ticks(tickCount).tickFormat(v => fmtVal(v.valueOf())))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').remove())
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 10));

    // Scroll selected bar into view.
    if (selectedFeature && containerRef.current) {
      const idx = sorted.findIndex(d => d.code === selectedFeature.code);
      if (idx >= 0) {
        const barCenterY = margin.top + yScale(sorted[idx].code)! + yScale.bandwidth() / 2;
        containerRef.current.scrollTop = barCenterY - containerRef.current.clientHeight / 2;
      }
    }
  }, [sorted, mean, needed, n, dimensions, data.unit, data.labels, selectedFeature, onFeatureSelect, comparisonFeature, onComparisonSelect]);

  const svgH = needed + MARGIN.top + MARGIN.bottom;

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
        </div>
      )}
    </div>
  );
};
