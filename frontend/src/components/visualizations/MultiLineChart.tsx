import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TimeSeriesNode } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';

const MARGIN    = { top: 12, right: 100, bottom: 44, left: 62 };
const parseDate = d3.timeParse('%Y-%m-%d');
const fmtYear   = d3.timeFormat('%Y');
const fmtTip    = d3.timeFormat('%b %Y');
const fmtVal    = d3.format(',.1f');

interface Props {
  data:            TimeSeriesNode[];
  label?:          string;
  colorOverrides?: Map<string, string>;
}

interface ParsedSeries {
  id:    string;
  label: string;
  color: string;
  pts:   Array<{ parsed: Date; value: number }>;
}

export function MultiLineChart({ data, label: _label, colorOverrides }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const tooltipRef   = useRef<HTMLDivElement>(null);
  const dims         = useResizeObserver(containerRef);

  const [visible,    setVisible]    = useState<Record<string, boolean>>({});
  const seriesKeyRef = useRef('');

  // Reset visibility whenever the set of series IDs changes (new dataset loaded).
  // Uses a ref so toggles made by the user are preserved when data refreshes
  // within the same dataset (e.g. year change keeps hidden series hidden).
  useEffect(() => {
    if (data.length === 0) { return; }
    const key = data.map(s => s.id).join(',');
    if (key === seriesKeyRef.current) { return; }
    seriesKeyRef.current = key;
    setVisible(Object.fromEntries(data.map(s => [s.id, true])));
  }, [data]);

  const toggle = useCallback((id: string) => {
    setVisible(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Stable per-series color: use overrides when provided (e.g. party colors), else Tableau10.
  const colorMap = useMemo(
    () => colorOverrides
      ? new Map(data.map(s => [s.id, colorOverrides.get(s.id) ?? (d3.schemeTableau10[0] as string)]))
      : new Map(data.map((s, i) => [s.id, d3.schemeTableau10[i % 10] as string])),
    [data, colorOverrides],
  );

  const parsedSeries = useMemo<ParsedSeries[]>(() => {
    return data
      .filter(s => visible[s.id])
      .map(s => ({
        id:    s.id,
        label: s.label,
        color: colorMap.get(s.id) ?? '#888',
        pts:   s.points
          .map(p => ({ parsed: parseDate(p.date), value: p.value }))
          .filter((p): p is { parsed: Date; value: number } => p.parsed !== null),
      }))
      .filter(s => s.pts.length > 0);
  }, [data, visible, colorMap]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (!dims || parsedSeries.length === 0) { return; }

    const { width, height } = dims;
    const adjW = width  - MARGIN.left - MARGIN.right;
    const adjH = height - MARGIN.top  - MARGIN.bottom;
    if (adjW <= 0 || adjH <= 0) { return; }

    svg.attr('width', width).attr('height', height);

    const clipId = 'mlc-clip';
    svg.append('defs').append('clipPath').attr('id', clipId)
      .append('rect').attr('width', adjW).attr('height', adjH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const allPts = parsedSeries.flatMap(s => s.pts);
    const minVal = d3.min(allPts, p => p.value) ?? 0;
    const maxVal = d3.max(allPts, p => p.value) ?? 1;
    const yPad   = (maxVal - minVal) * 0.04;

    const xScale = d3.scaleTime()
      .domain(d3.extent(allPts, p => p.parsed) as [Date, Date])
      .range([0, adjW]);

    // Y starts near the actual minimum — avoids wasting space when data doesn't start at 0.
    const yScale = d3.scaleLinear()
      .domain([minVal - yPad, maxVal + yPad])
      .range([adjH, 0]);

    // ── Gridlines ─────────────────────────────────────────────────────────────
    g.selectAll<SVGLineElement, number>('line.grid')
      .data(yScale.ticks(6))
      .join('line').attr('class', 'grid')
      .attr('x1', 0).attr('x2', adjW)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', '#e5e7eb').attr('stroke-width', 1);

    // ── X axis ────────────────────────────────────────────────────────────────
    g.append('g')
      .attr('transform', `translate(0,${adjH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(Math.max(3, Math.floor(adjW / 80)))
          .tickFormat(d => fmtYear(d as Date))
          .tickSize(4),
      )
      .call(ax => ax.select('.domain').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll<SVGTextElement, unknown>('text')
        .attr('fill', '#9ca3af').attr('font-size', 12))
      .call(ax => ax.selectAll<SVGLineElement, unknown>('.tick line')
        .attr('stroke', '#e5e7eb'));

    // ── Y axis ────────────────────────────────────────────────────────────────
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(6).tickSize(0))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll<SVGTextElement, unknown>('text')
        .attr('fill', '#9ca3af').attr('font-size', 11).attr('dx', '-2'));

    // ── Lines ─────────────────────────────────────────────────────────────────
    const line = d3.line<{ parsed: Date; value: number }>()
      .x(p => xScale(p.parsed))
      .y(p => yScale(p.value))
      .curve(d3.curveMonotoneX);

    const linesG = g.append('g').attr('clip-path', `url(#${clipId})`);
    // Store DOM elements for hover dimming.
    const lineEls = new Map<string, SVGPathElement>();
    parsedSeries.forEach(series => {
      const el = linesG.append('path')
        .datum(series.pts)
        .attr('fill', 'none')
        .attr('stroke', series.color)
        .attr('stroke-width', 2)
        .attr('d', line(series.pts))
        .node();
      if (el) { lineEls.set(series.id, el); }
    });

    // ── End-of-line labels ────────────────────────────────────────────────────
    const LABEL_MAX = 15;
    const truncate  = (s: string) => s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + '…' : s;
    // Build positions from each series' last point.
    const labelPos = parsedSeries
      .filter(s => s.pts.length > 0)
      .map(s => ({ id: s.id, color: s.color, text: truncate(s.label), y: yScale(s.pts[s.pts.length - 1].value) }))
      .sort((a, b) => a.y - b.y);
    // Iterative push-down to resolve collisions.
    const MIN_GAP = 13;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < labelPos.length; i++) {
        if (labelPos[i].y - labelPos[i - 1].y < MIN_GAP) {
          labelPos[i].y = labelPos[i - 1].y + MIN_GAP;
        }
      }
    }
    labelPos.forEach(lp => {
      g.append('text')
        .attr('x', adjW + 6).attr('y', Math.min(adjH, lp.y))
        .attr('dy', '0.35em').attr('font-size', 10)
        .attr('fill', lp.color)
        .text(lp.text);
    });

    // ── Hover elements ────────────────────────────────────────────────────────
    const crosshair = g.append('line')
      .attr('y1', 0).attr('y2', adjH)
      .attr('stroke', '#94a3b8').attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .style('opacity', 0);

    const hoverDots = parsedSeries.map(series =>
      g.append('circle')
        .attr('r', 3.5)
        .attr('fill', series.color)
        .attr('stroke', '#fff').attr('stroke-width', 1.5)
        .style('opacity', 0),
    );

    const bisect  = d3.bisector((p: { parsed: Date }) => p.parsed).left;
    const tooltip = d3.select(tooltipRef.current);

    // Overlay rect on the SVG (not inside g) so pointer coords are in SVG space.
    svg.append('rect')
      .attr('x', MARGIN.left).attr('y', MARGIN.top)
      .attr('width', adjW).attr('height', adjH)
      .style('fill', 'none').style('pointer-events', 'all')
      .on('mousemove', (event: MouseEvent) => {
        const [svgX, svgY] = d3.pointer(event, svgRef.current);
        const chartX = svgX - MARGIN.left;
        const chartY = svgY - MARGIN.top;

        if (chartX < 0 || chartX > adjW) {
          crosshair.style('opacity', 0);
          hoverDots.forEach(dot => dot.style('opacity', 0));
          tooltip.style('opacity', '0');
          lineEls.forEach(el => d3.select(el).attr('stroke-opacity', 1));
          return;
        }

        const x0 = xScale.invert(chartX);
        crosshair.attr('x1', chartX).attr('x2', chartX).style('opacity', 1);

        // Find the series whose line is closest to the cursor's y position.
        let closestId = '';
        let minDist   = Infinity;

        const rows = parsedSeries.map((series, i) => {
          const idx = bisect(series.pts, x0, 1);
          const d0  = series.pts[idx - 1];
          const d1  = series.pts[idx] ?? d0;
          const pt  = !d1 || x0.getTime() - d0.parsed.getTime() <= d1.parsed.getTime() - x0.getTime() ? d0 : d1;
          hoverDots[i]
            .attr('cx', xScale(pt.parsed))
            .attr('cy', yScale(pt.value))
            .style('opacity', 1);
          const dist = Math.abs(yScale(pt.value) - chartY);
          if (dist < minDist) { minDist = dist; closestId = series.id; }
          return { label: series.label, color: series.color, value: pt.value, date: pt.parsed };
        });

        // Dim all lines except the closest.
        lineEls.forEach((el, id) => {
          d3.select(el).attr('stroke-opacity', id === closestId ? 1 : 0.12);
        });

        // Sort by value descending so highest series is at the top.
        const sorted   = [...rows].sort((a, b) => b.value - a.value);
        const dateStr  = fmtTip(sorted[0]?.date ?? new Date());
        const rowsHtml = sorted.map(r =>
          `<div style="display:flex;align-items:center;gap:6px;padding:1px 0;">` +
            `<span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0;"></span>` +
            `<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;">${r.label}</span>` +
            `<span style="font-variant-numeric:tabular-nums;margin-left:8px;">${fmtVal(r.value)}</span>` +
          `</div>`,
        ).join('');

        tooltip.html(
          `<div style="color:#94a3b8;font-size:10px;font-weight:600;margin-bottom:5px;letter-spacing:0.05em;">` +
            `${dateStr}</div>${rowsHtml}`,
        );

        // Smart tooltip positioning: flip left/right to stay on screen.
        const cEl = containerRef.current;
        if (!cEl) { return; }
        const cRect = cEl.getBoundingClientRect();
        const ex    = event.clientX - cRect.left;
        const ey    = event.clientY - cRect.top;
        const tEl   = tooltipRef.current;
        const tipW  = tEl?.offsetWidth  ?? 240;
        const tipH  = tEl?.offsetHeight ?? 200;
        const tipX  = ex + 20 + tipW > cRect.width ? ex - tipW - 8 : ex + 20;
        const tipY  = Math.max(4, Math.min(ey - tipH / 2, cRect.height - tipH - 4));

        tooltip.style('left', `${tipX}px`).style('top', `${tipY}px`).style('opacity', '1');
      })
      .on('mouseleave', () => {
        crosshair.style('opacity', 0);
        hoverDots.forEach(dot => dot.style('opacity', 0));
        tooltip.style('opacity', '0');
        lineEls.forEach(el => d3.select(el).attr('stroke-opacity', 1));
      });

  }, [parsedSeries, dims]);

  return (
    <div className="relative w-full h-full flex flex-col">

      {/* Legend — visibility toggles; end-of-line labels handle identification */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 flex-shrink-0">
        {data.map(series => {
          const color = colorMap.get(series.id) ?? '#888';
          const on    = visible[series.id] !== false;
          return (
            <button
              key={series.id}
              onClick={() => toggle(series.id)}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-opacity whitespace-nowrap"
              style={{ opacity: on ? 1 : 0.3 }}
            >
              <svg width="22" height="12" viewBox="0 0 22 12" className="flex-shrink-0">
                <line x1="0" y1="6" x2="22" y2="6" stroke={color} strokeWidth="3" strokeLinecap="round" />
              </svg>
              {series.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        <svg ref={svgRef} className="w-full h-full" />
        <div
          ref={tooltipRef}
          className="absolute z-10 pointer-events-none bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl"
          style={{ opacity: 0, maxWidth: '260px' }}
        />
      </div>

    </div>
  );
}
