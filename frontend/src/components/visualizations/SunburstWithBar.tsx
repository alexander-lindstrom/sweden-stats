import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GeoHierarchyNode } from '@/datasets/types';
import { Tooltip } from '@/components/ui/Tooltip';
import useResizeObserver from '@/hooks/useResizeObserver';

interface Props {
  root: GeoHierarchyNode;
  unit: string;
  label: string;
}

interface TT {
  x: number;
  y: number;
  visible: boolean;
  name: string;
  value: number;
}

const BAR_M      = { top: 20, right: 72, bottom: 36, left: 168 };
const MAX_BARS   = 40;
const MAX_BAR_H  = 20;   // max bar height in px — matches budget chart density
const BAR_GAP    = 1;    // gap between bars in px

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return v.toLocaleString('sv-SE');
}

export const SunburstWithBar: React.FC<Props> = ({ root, unit, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sunRef       = useRef<SVGSVGElement>(null);
  const barRef       = useRef<SVGSVGElement>(null);
  const dims         = useResizeObserver(containerRef);

  const [focus,   setFocus]   = useState<GeoHierarchyNode>(root);
  const [history, setHistory] = useState<GeoHierarchyNode[]>([]);
  const [tt,      setTT]      = useState<TT>({ x: 0, y: 0, visible: false, name: '', value: 0 });

  // Reset when root data changes.
  useEffect(() => { setFocus(root); setHistory([]); }, [root]);

  // Keep refs so d3 event handlers always see current state.
  const focusRef   = useRef(focus);   focusRef.current   = focus;
  const historyRef = useRef(history); historyRef.current = history;

  const drillDown = useCallback((node: GeoHierarchyNode) => {
    if (!node.children?.length) return;
    setHistory(h => [...h, focusRef.current]);
    setFocus(node);
  }, []);

  const drillUp = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    setFocus(prev);
  }, []);

  // Shared color scale — same keys and colors in both charts.
  // Offset by 0.5/n so colors are evenly centred and don't wrap near t=0/t=1.
  const colorScale = useMemo(() => {
    const ch = focus.children ?? [];
    const n  = Math.max(ch.length, 1);
    return d3.scaleOrdinal<string>()
      .domain(ch.map(c => c.name))
      .range(ch.map((_, i) => d3.interpolateRainbow((i + 0.5) / n)));
  }, [focus]);

  // ── Sunburst ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sunRef.current || !dims) return;

    const w      = Math.floor(dims.width / 2);
    const h      = dims.height;
    const radius = Math.min(w, h) / 2 * 0.88;

    const svg = d3.select(sunRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    const g = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`);

    const hier = d3.hierarchy<GeoHierarchyNode>(focus)
      .sum(d => (!d.children?.length ? d.value : 0));
    d3.partition<GeoHierarchyNode>().size([2 * Math.PI, radius])(hier);

    type PN = d3.HierarchyRectangularNode<GeoHierarchyNode>;
    const nodes = hier.descendants() as PN[];

    function nodeColor(d: PN): string {
      if (d.depth === 0) return '#e0e0e0';
      let a: PN = d;
      while (a.depth > 1 && a.parent) a = a.parent as PN;
      return colorScale(a.data.name);
    }

    const arc = d3.arc<PN>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => (d.depth === 0 ? 0 : d.y0))
      .outerRadius(d => d.y1 - 0.5);

    const drillable = (d: PN) =>
      (d.depth === 0 && historyRef.current.length > 0) ||
      (d.depth > 0 && !!d.children?.length);

    g.selectAll<SVGPathElement, PN>('path')
      .data(nodes)
      .join('path')
      .attr('d', arc)
      .attr('fill', nodeColor)
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5)
      .style('cursor', d => (drillable(d) ? 'pointer' : 'default'))
      .on('click', (_e, d) => {
        if (d.depth === 0) { drillUp(); return; }
        if (d.children?.length) drillDown(d.data);
      })
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill-opacity', 0.6);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTT({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true, name: d.data.name, value: d.data.value });
      })
      .on('mouseout', e => {
        d3.select(e.currentTarget).attr('fill-opacity', 1);
        setTT(t => ({ ...t, visible: false }));
      });

    // Center label — drawn after arcs so it sits on top of the grey disc.
    const drilled = historyRef.current.length > 0;
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', drilled ? '-0.9em' : '-0.3em')
      .attr('font-size', 13).attr('font-weight', '600').attr('fill', '#1f2937')
      .attr('pointer-events', 'none')
      .text(focus.name);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', drilled ? '0.6em' : '1em')
      .attr('font-size', 11).attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(`${fmtShort(focus.value)} ${unit}`);
    if (drilled) {
      g.append('text')
        .attr('text-anchor', 'middle').attr('dy', '2.2em')
        .attr('font-size', 10).attr('fill', '#3b82f6')
        .attr('pointer-events', 'none')
        .text('↑ tillbaka');
    }
  }, [focus, dims, history.length, colorScale, unit, drillDown, drillUp]);

  // ── Bar chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!barRef.current || !dims) return;

    const w      = dims.width - Math.floor(dims.width / 2);
    const h      = dims.height;
    const innerW = w - BAR_M.left - BAR_M.right;
    const innerH = h - BAR_M.top  - BAR_M.bottom;
    if (innerW <= 0 || innerH <= 0) return;

    const sorted = [...(focus.children ?? [])]
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_BARS);

    const svg = d3.select(barRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    if (!sorted.length) return;

    const g = svg.append('g').attr('transform', `translate(${BAR_M.left},${BAR_M.top})`);

    // Fixed bar height with centering — matches budget chart density.
    const n        = sorted.length;
    const needed   = n * MAX_BAR_H + Math.max(n - 1, 0) * BAR_GAP;
    const effH     = Math.min(innerH, needed);
    const vOffset  = (innerH - effH) / 2;
    const padding  = n > 1 ? BAR_GAP / MAX_BAR_H : 0;

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sorted, d => d.value) ?? 1])
      .range([0, innerW]).nice();

    const yScale = d3.scaleBand<string>()
      .domain(sorted.map(d => d.name))
      .range([vOffset, vOffset + effH])
      .paddingInner(padding);

    // Light grid lines.
    g.selectAll('line.grid')
      .data(xScale.ticks(4))
      .join('line').attr('class', 'grid')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', vOffset).attr('y2', vOffset + effH)
      .attr('stroke', '#f3f4f6').attr('stroke-width', 1);

    // Bars.
    g.selectAll<SVGRectElement, GeoHierarchyNode>('rect.bar')
      .data(sorted)
      .join('rect').attr('class', 'bar')
      .attr('x', 0)
      .attr('y', d => yScale(d.name)!)
      .attr('width', d => xScale(d.value))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.name))
      .attr('stroke', '#000').attr('stroke-width', 0.5)
      .style('cursor', d => (d.children?.length ? 'pointer' : 'default'))
      .on('click', (_e, d) => { if (d.children?.length) drillDown(d); })
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill-opacity', 0.6);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTT({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true, name: d.name, value: d.value });
      })
      .on('mouseout', e => {
        d3.select(e.currentTarget).attr('fill-opacity', 1);
        setTT(t => ({ ...t, visible: false }));
      });

    // Value labels (right of bar).
    g.selectAll<SVGTextElement, GeoHierarchyNode>('text.val')
      .data(sorted)
      .join('text').attr('class', 'val')
      .attr('x', d => xScale(d.value) + 5)
      .attr('y', d => yScale(d.name)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', 11).attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(d => fmtShort(d.value));

    // Y-axis — names, truncated to fit the left margin using actual render width.
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(8))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll<SVGTextElement, string>('text')
        .attr('font-size', 12).attr('fill', '#374151')
        .text(name => name)
        .each(function() {
          const el  = this as SVGTextElement;
          const max = BAR_M.left - 16;
          if (el.getComputedTextLength() <= max) return;
          let t = el.textContent ?? '';
          while (t.length > 2 && el.getComputedTextLength() > max) {
            t = t.slice(0, -1);
            el.textContent = t + '…';
          }
        }));

    // X-axis.
    g.append('g')
      .attr('transform', `translate(0,${vOffset + effH})`)
      .call(d3.axisBottom(xScale).ticks(4).tickFormat(n => {
        const v = n.valueOf();
        return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
             : v >= 1_000     ? `${(v / 1_000).toFixed(0)}k`
             : String(v);
      }))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 11));

    // Dataset label.
    svg.append('text')
      .attr('x', w - 4).attr('y', 14)
      .attr('text-anchor', 'end')
      .attr('font-size', 11).attr('fill', '#9ca3af')
      .text(label);

  }, [focus, dims, colorScale, unit, label, drillDown]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex">
      <svg ref={sunRef} className="flex-shrink-0" />
      <div className="w-px bg-gray-100 self-stretch flex-shrink-0" />
      <svg ref={barRef} className="flex-1 min-w-0" />
      <Tooltip x={tt.x} y={tt.y} visible={tt.visible}>
        <div className="font-medium">{tt.name}</div>
        <div className="text-gray-400 mt-0.5">{fmtShort(tt.value)} {unit}</div>
      </Tooltip>
    </div>
  );
};
