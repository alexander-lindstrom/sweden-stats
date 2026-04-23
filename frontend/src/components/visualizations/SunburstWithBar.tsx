import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AdminLevel, GeoHierarchyNode } from '@/datasets/types';
import { Tooltip } from '@/components/ui/Tooltip';
import useResizeObserver from '@/hooks/useResizeObserver';
import { CT } from './chartTokens';
import { drawChartFrame } from './chartFrame';

interface Props {
  root: GeoHierarchyNode;
  unit: string;
  label: string;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
  onComparisonSelect?: (f: { code: string; label: string } | null) => void;
  /** Maps drill depth (0 = root, 1 = first ring, 2 = second ring, …) to AdminLevel.
   *  When provided, onSelectionLevelChange fires with the level for each click. */
  depthToLevel?: AdminLevel[];
  onSelectionLevelChange?: (level: AdminLevel) => void;
  /** If provided, the sunburst will pre-drill to the node with this code on mount. */
  initialCode?: string;
}

interface TT {
  visible: boolean;
  name: string;
  value: number;
}

const BAR_M      = { top: 20, right: 16, bottom: 50, left: 168 };
const MAX_BARS   = 40;
const MAX_BAR_H  = 20;   // max bar height in px
const BAR_GAP    = 1;    // gap between bars in px

/** Walk the hierarchy and return the node matching `code`, plus the path of ancestors. */
function findNode(node: GeoHierarchyNode, code: string, path: GeoHierarchyNode[] = []): { node: GeoHierarchyNode; path: GeoHierarchyNode[] } | null {
  if (node.code === code) { return { node, path }; }
  for (const child of node.children ?? []) {
    const result = findNode(child, code, [...path, node]);
    if (result) { return result; }
  }
  return null;
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) {return `${(v / 1_000_000).toFixed(1)}M`;}
  if (v >= 1_000)     {return `${(v / 1_000).toFixed(0)}k`;}
  return v.toLocaleString('sv-SE');
}

export const SunburstWithBar: React.FC<Props> = ({ root, unit, label, onFeatureSelect, onComparisonSelect, depthToLevel, onSelectionLevelChange, initialCode }) => {
  const containerRef               = useRef<HTMLDivElement>(null);
  const sunRef                     = useRef<SVGSVGElement>(null);
  const barRef                     = useRef<SVGSVGElement>(null);
  const tooltipRef                 = useRef<HTMLDivElement>(null);
  const dims                       = useResizeObserver(containerRef);
  const onFeatureSelectRef         = useRef(onFeatureSelect);
  const onComparisonSelectRef      = useRef(onComparisonSelect);
  const onSelectionLevelChangeRef  = useRef(onSelectionLevelChange);
  const depthToLevelRef            = useRef(depthToLevel);
  onFeatureSelectRef.current        = onFeatureSelect;
  onComparisonSelectRef.current     = onComparisonSelect;
  onSelectionLevelChangeRef.current = onSelectionLevelChange;
  depthToLevelRef.current           = depthToLevel;

  const emitLevel = (depth: number) => {
    const level = depthToLevelRef.current?.[depth];
    if (level) {onSelectionLevelChangeRef.current?.(level);}
  };

  const [focus,   setFocus]   = useState<GeoHierarchyNode>(() => {
    if (!initialCode) { return root; }
    return findNode(root, initialCode)?.node ?? root;
  });
  const [history, setHistory] = useState<GeoHierarchyNode[]>(() => {
    if (!initialCode) { return []; }
    return findNode(root, initialCode)?.path ?? [];
  });
  const [tt,      setTT]      = useState<TT>({ visible: false, name: '', value: 0 });

  // Reset when root data changes (dataset/year switch). Skips the initial mount
  // so URL-initialized drill state is preserved, and uses prevRootRef to survive
  // React Strict Mode's double-invocation (same root = Strict Mode re-fire, skip).
  const prevRootRef = useRef<GeoHierarchyNode | null>(null);
  useEffect(() => {
    const prev = prevRootRef.current;
    prevRootRef.current = root;
    if (prev === null || prev === root) { return; }
    setFocus(root);
    setHistory([]);
  }, [root]);

  // Keep refs so d3 event handlers always see current state.
  const focusRef   = useRef(focus);   focusRef.current   = focus;
  const historyRef = useRef(history); historyRef.current = history;

  // When the user shift-clicks a leaf after drilling into a parent, the current
  // selectedFeature is the parent (e.g. a Region code) which won't be found at
  // the leaf admin level.  Upgrade it to the best-matching leaf within the focus:
  // prefer the child whose name matches the focus name (e.g. "Stockholm" stad
  // inside Stockholm Lan), otherwise fall back to the largest child.
  const upgradePrimaryToLeaf = useCallback(() => {
    const focus = focusRef.current;
    if (!focus.children?.length) { return; }
    const match = focus.children.find(c => c.name === focus.name) ?? focus.children[0];
    onFeatureSelectRef.current?.({ code: match.code, label: match.name });
  }, []);

  const drillDown = useCallback((node: GeoHierarchyNode) => {
    if (!node.children?.length) {return;}
    const depth = historyRef.current.length + 1;
    setHistory(h => [...h, focusRef.current]);
    setFocus(node);
    emitLevel(depth);
    onFeatureSelectRef.current?.({ code: node.code, label: node.name });
  }, []);

  const drillUp = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) {return;}
    const depth = historyRef.current.length - 1;
    setHistory(h => h.slice(0, -1));
    setFocus(prev);
    // Going back to root (history empties) → clear selection; otherwise select the parent node.
    if (historyRef.current.length === 1) {
      onFeatureSelectRef.current?.(null);
    } else {
      emitLevel(depth);
      onFeatureSelectRef.current?.({ code: prev.code, label: prev.name });
    }
  }, []);

  const colorScale = useMemo(() => {
    const ch = focus.children ?? [];
    return d3.scaleOrdinal<string>()
      .domain(ch.map(c => c.name))
      .range([...d3.schemeTableau10]);
  }, [focus]);

  // ── Sunburst ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sunRef.current || !dims) {return;}

    const isNarrow = dims.width < 480;
    const SUN_H    = 220;
    const w      = isNarrow ? dims.width : Math.floor(dims.width / 2);
    const h      = isNarrow ? SUN_H      : dims.height;
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
    // Radius of the center grey disc — used to scale text so it fits on narrow screens.
    const centerR = (hier as unknown as PN).y1;
    const nameFontSize = Math.max(7,  Math.min(11, centerR * 0.30));
    const valFontSize  = Math.max(6,  Math.min(9,  centerR * 0.22));
    const backFontSize = Math.max(5,  Math.min(8,  centerR * 0.17));

    function nodeColor(d: PN): string {
      if (d.depth === 0) {return '#e0e0e0';}
      let a: PN = d;
      while (a.depth > 1 && a.parent) {a = a.parent as PN;}
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
      .attr('stroke', 'rgba(255,255,255,0.35)')
      .attr('stroke-width', 0.5)
      .style('cursor', d => (drillable(d) ? 'pointer' : 'default'))
      .on('click', (e, d) => {
        if (d.depth === 0) { drillUp(); return; }
        if (d.children?.length) { drillDown(d.data); return; }
        emitLevel(historyRef.current.length + d.depth);
        if ((e as MouseEvent).shiftKey) {
          upgradePrimaryToLeaf();
          onComparisonSelectRef.current?.({ code: d.data.code, label: d.data.name });
        } else {
          onFeatureSelectRef.current?.({ code: d.data.code, label: d.data.name });
        }
      })
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill-opacity', 0.6);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && tooltipRef.current) {
          tooltipRef.current.style.left = `${e.clientX - rect.left + 12}px`;
          tooltipRef.current.style.top  = `${e.clientY - rect.top  - 28}px`;
        }
        setTT({ visible: true, name: d.data.name, value: d.data.value });
      })
      .on('mouseout', e => {
        d3.select(e.currentTarget).attr('fill-opacity', 1);
        setTT(t => ({ ...t, visible: false }));
      });

    // Center label — drawn after arcs so it sits on top of the grey disc.
    const drilled = historyRef.current.length > 0;
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', drilled ? '-0.9em' : '-0.3em')
      .attr('font-size', nameFontSize).attr('font-weight', '600').attr('fill', '#1f2937')
      .attr('pointer-events', 'none')
      .text(focus.name);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', drilled ? '0.6em' : '1em')
      .attr('font-size', valFontSize).attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(`${fmtShort(focus.value)} ${unit}`);
    if (drilled) {
      g.append('text')
        .attr('text-anchor', 'middle').attr('dy', '2.2em')
        .attr('font-size', backFontSize).attr('fill', '#3b82f6')
        .attr('pointer-events', 'none')
        .text('↑ tillbaka');
    }
  }, [focus, dims, history.length, colorScale, unit, drillDown, drillUp, upgradePrimaryToLeaf]);

  // ── Bar chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!barRef.current || !dims) {return;}

    const isNarrow = dims.width < 480;
    const SUN_H    = 220;
    const w      = isNarrow ? dims.width                            : dims.width - Math.floor(dims.width / 2);
    const h      = isNarrow ? Math.max(0, dims.height - SUN_H - 1) : dims.height;
    const innerW = w - BAR_M.left - BAR_M.right;
    const innerH = h - BAR_M.top  - BAR_M.bottom;
    if (innerW <= 0 || innerH <= 0) {return;}

    const sorted = [...(focus.children ?? [])]
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_BARS);

    const svg = d3.select(barRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', w).attr('height', h);

    if (!sorted.length) {return;}

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

    // Grid lines — behind everything.
    g.selectAll('line.grid')
      .data(xScale.ticks(4))
      .join('line').attr('class', 'grid')
      .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
      .attr('y1', vOffset).attr('y2', vOffset + effH)
      .attr('stroke', CT.gridLine).attr('stroke-width', 1);

    drawChartFrame(g, innerW, innerH, {
      yTop: vOffset,
      yBottom: vOffset + effH,
      separatorCount: n - 1,
      separatorY: i => yScale(sorted[i + 1].name)! - 0.5,
      leftExtend: BAR_M.left,
    });

    // Bars.
    g.selectAll<SVGRectElement, GeoHierarchyNode>('rect.bar')
      .data(sorted)
      .join('rect').attr('class', 'bar')
      .attr('x', 0)
      .attr('y', d => yScale(d.name)!)
      .attr('width', d => xScale(d.value))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.name))
      .attr('stroke', CT.barStroke).attr('stroke-width', 0.5)
      .style('cursor', d => (d.children?.length ? 'pointer' : 'default'))
      .on('click', (e, d) => {
        if (d.children?.length) { drillDown(d); return; }
        emitLevel(historyRef.current.length + 1);
        if ((e as MouseEvent).shiftKey) {
          upgradePrimaryToLeaf();
          onComparisonSelectRef.current?.({ code: d.code, label: d.name });
        } else {
          onFeatureSelectRef.current?.({ code: d.code, label: d.name });
        }
      })
      .on('mouseover', (e, d) => {
        d3.select(e.currentTarget).attr('fill-opacity', 0.6);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && tooltipRef.current) {
          tooltipRef.current.style.left = `${e.clientX - rect.left + 12}px`;
          tooltipRef.current.style.top  = `${e.clientY - rect.top  - 28}px`;
        }
        setTT({ visible: true, name: d.name, value: d.value });
      })
      .on('mouseout', e => {
        d3.select(e.currentTarget).attr('fill-opacity', 1);
        setTT(t => ({ ...t, visible: false }));
      });

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
          if (el.getComputedTextLength() <= max) {return;}
          let t = el.textContent ?? '';
          while (t.length > 2 && el.getComputedTextLength() > max) {
            t = t.slice(0, -1);
            el.textContent = t + '…';
          }
        }));

    // X-axis.
    g.append('g')
      .attr('transform', `translate(0,${vOffset + effH})`)
      .call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(innerW / 55))).tickFormat(n => {
        const v = n.valueOf();
        return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
             : v >= 1_000     ? `${(v / 1_000).toFixed(0)}k`
             : String(v);
      }))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', CT.gridLine))
      .call(ax => ax.selectAll('text').attr('fill', CT.tickText).attr('font-size', 11));

    // X-axis label.
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', vOffset + effH + BAR_M.bottom - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', CT.tickText)
      .text(`${label}${unit ? ` (${unit})` : ''}`);

  }, [focus, dims, colorScale, unit, label, drillDown, upgradePrimaryToLeaf]);

  const isNarrow = !!dims && dims.width < 480;

  return (
    <div ref={containerRef} className={['relative w-full h-full flex', isNarrow ? 'flex-col' : ''].join(' ')}>
      <svg ref={sunRef} className="flex-shrink-0" />
      <div className={isNarrow ? 'h-px w-full bg-gray-100 flex-shrink-0' : 'w-px bg-gray-100 self-stretch flex-shrink-0'} />
      <svg ref={barRef} className="flex-1 min-w-0" />
      <Tooltip ref={tooltipRef} visible={tt.visible}>
        <div className="font-medium">{tt.name}</div>
        <div className="text-gray-400 mt-0.5">{fmtShort(tt.value)} {unit}</div>
      </Tooltip>
    </div>
  );
};
