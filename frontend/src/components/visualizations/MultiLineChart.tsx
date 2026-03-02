import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TimeSeriesNode } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';

const MARGIN    = { top: 20, right: 40, bottom: 60, left: 60 };
const parseDate = d3.timeParse('%Y-%m-%d');
const fmtDate   = d3.timeFormat('%Y-%m');
const fmtValue  = d3.format(',.2f');

interface Props {
  data:   TimeSeriesNode[];
  label?: string;
}

interface ParsedSeries {
  id:    string;
  label: string;
  pts:   Array<{ parsed: Date; value: number }>;
}

export function MultiLineChart({ data, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const tooltipRef   = useRef<HTMLDivElement>(null);
  const dims         = useResizeObserver(containerRef);

  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  // Initialise visibility on first data load (all series visible).
  useEffect(() => {
    if (!initialized && data.length > 0) {
      setVisible(Object.fromEntries(data.map(s => [s.id, true])));
      setInitialized(true);
    }
  }, [data, initialized]);

  const toggle = useCallback((id: string) => {
    setVisible(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const colorScale = useMemo(
    () => d3.scaleOrdinal(d3.schemeCategory10).domain(data.map(s => s.id)),
    [data],
  );

  // Pre-parse dates once per render so both the chart and tooltip share the same arrays.
  const parsedSeries = useMemo<ParsedSeries[]>(() => {
    return data
      .filter(s => visible[s.id])
      .map(s => ({
        id:    s.id,
        label: s.label,
        pts:   s.points
          .map(p => ({ parsed: parseDate(p.date), value: p.value }))
          .filter((p): p is { parsed: Date; value: number } => p.parsed !== null),
      }))
      .filter(s => s.pts.length > 0);
  }, [data, visible]);

  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current || !initialized || !dims) { return; }
    if (parsedSeries.length === 0) { return; }

    const { width, height } = dims;
    const adjW = width  - MARGIN.left - MARGIN.right;
    const adjH = height - MARGIN.top  - MARGIN.bottom;
    if (adjW <= 0 || adjH <= 0) { return; }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const allPts = parsedSeries.flatMap(s => s.pts);

    const xScale = d3.scaleTime()
      .domain(d3.extent(allPts, p => p.parsed) as [Date, Date])
      .range([0, adjW]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allPts, p => p.value) ?? 1])
      .range([adjH, 0])
      .nice();

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${adjH})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => fmtDate(d as Date)))
      .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(yScale));

    // Lines
    const line = d3.line<{ parsed: Date; value: number }>()
      .x(p => xScale(p.parsed))
      .y(p => yScale(p.value))
      .curve(d3.curveMonotoneX);

    parsedSeries.forEach(series => {
      g.append('path')
        .datum(series.pts)
        .attr('fill', 'none')
        .attr('stroke', colorScale(series.id) as string)
        .attr('stroke-width', 2)
        .attr('d', line(series.pts));
    });

    // Hover overlay
    const tooltip   = d3.select(tooltipRef.current);
    const bisect    = d3.bisector((p: { parsed: Date }) => p.parsed).left;
    const vertLine  = g.append('line')
      .attr('y1', 0).attr('y2', adjH)
      .style('stroke', '#999').style('stroke-dasharray', '4,4').style('opacity', 0);

    g.append('rect')
      .attr('width', adjW).attr('height', adjH)
      .style('fill', 'none').style('pointer-events', 'all')
      .on('mousemove', function(event) {
        const mx = d3.pointer(event)[0];
        if (mx < 0 || mx > adjW) {
          tooltip.style('opacity', 0);
          vertLine.style('opacity', 0);
          return;
        }

        const x0  = xScale.invert(mx);
        const rows = parsedSeries.map(series => {
          const i  = bisect(series.pts, x0, 1);
          const d0 = series.pts[i - 1];
          const d1 = series.pts[i] ?? d0;
          const pt = x0.getTime() - d0.parsed.getTime() > d1.parsed.getTime() - x0.getTime() ? d1 : d0;
          return { label: series.label, value: pt.value, color: colorScale(series.id) as string, date: fmtDate(pt.parsed) };
        });

        vertLine.attr('x1', mx).attr('x2', mx).style('opacity', 1);

        const html = `
          <strong>${rows[0]?.date ?? ''}</strong>
          <ul style="padding-left:0;margin:4px 0;list-style:none;">
            ${rows.map(r => `<li style="margin:2px 0;"><span style="color:${r.color}">●</span> ${r.label}: ${fmtValue(r.value)}</li>`).join('')}
          </ul>`;

        const [px, py] = d3.pointer(event, svg.node());
        tooltip
          .html(html)
          .style('left',    `${px + 90}px`)
          .style('top',     `${py - 40}px`)
          .style('opacity', '1');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', '0');
        vertLine.style('opacity', 0);
      });

  }, [parsedSeries, dims, colorScale, initialized]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {label && (
        <div className="text-sm font-semibold text-gray-700 px-2 pt-2 flex-shrink-0">{label}</div>
      )}

      {/* Series toggle legend */}
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5 flex-shrink-0">
        {data.map(series => (
          <button
            key={series.id}
            onClick={() => toggle(series.id)}
            className={[
              'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-opacity',
              visible[series.id] ? 'opacity-100' : 'opacity-35',
            ].join(' ')}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: colorScale(series.id) as string }}
            />
            {series.label}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-0">
        <svg ref={svgRef} className="w-full h-full" />
        <div
          ref={tooltipRef}
          className="absolute z-10 pointer-events-none bg-white border border-gray-200 rounded shadow-sm text-xs px-2 py-1.5"
          style={{ opacity: 0 }}
        />
      </div>
    </div>
  );
}
