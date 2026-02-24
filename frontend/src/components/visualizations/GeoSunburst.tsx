import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GeoHierarchyNode } from '@/datasets/types';
import { Tooltip } from '@/components/ui/Tooltip';
import useResizeObserver from '@/hooks/useResizeObserver';

interface GeoSunburstProps {
  root: GeoHierarchyNode;
  unit: string;
  label: string;
}

interface TooltipState {
  x: number;
  y: number;
  visible: boolean;
  name: string;
  value: number;
}

const MIN_LABEL_ANGLE = 0.15;  // radians — minimum arc span to render a label
const CENTER_R_RATIO  = 0.18;  // center hole as a fraction of radius
const LABEL_H         = 20;    // px reserved for dataset label at top of SVG

/** Strip "s? län" suffix from Swedish county names for compact display. */
function shortLanName(name: string): string {
  return name.replace(/s? län$/i, '').trim();
}

export const GeoSunburst: React.FC<GeoSunburstProps> = ({ root, unit, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);

  const [focus,   setFocus]   = useState<GeoHierarchyNode>(root);
  const [history, setHistory] = useState<GeoHierarchyNode[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, visible: false, name: '', value: 0 });

  // Reset navigation when root changes (e.g. dataset reload).
  useEffect(() => {
    setFocus(root);
    setHistory([]);
  }, [root]);

  const handleDrillDown = (node: GeoHierarchyNode) => {
    if (!node.children || node.children.length === 0) return;
    setHistory(h => [...h, focus]);
    setFocus(node);
  };

  const handleBack = () => {
    setHistory(h => {
      const prev = h[h.length - 1];
      if (prev) {
        setFocus(prev);
        return h.slice(0, -1);
      }
      return h;
    });
  };

  useEffect(() => {
    if (!svgRef.current || !dimensions) return;

    const { width, height } = dimensions;

    // Chart area is below the label text.
    const chartH = height - LABEL_H;
    const size   = Math.min(width, chartH);
    const radius = size / 2;
    const CENTER_R = radius * CENTER_R_RATIO;
    // Vertical center of the chart area.
    const cy = LABEL_H + chartH / 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // Dataset label at the top.
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#9ca3af')
      .text(label);

    const g = svg.append('g').attr('transform', `translate(${width / 2},${cy})`);

    // Build hierarchy.
    const hier = d3.hierarchy<GeoHierarchyNode>(focus)
      .sum(d => (d.children && d.children.length > 0) ? 0 : d.value);

    d3.partition<GeoHierarchyNode>().size([2 * Math.PI, radius])(hier);

    type PartitionNode = d3.HierarchyRectangularNode<GeoHierarchyNode>;

    const visibleNodes = hier.descendants().filter(d => d.depth >= 1) as PartitionNode[];

    // The partition's root node occupies y0=0 → y1=radius/numLevels but is invisible.
    // Remap visible y range [yMin, radius] → [CENTER_R, radius] to close the gap.
    const yMin = d3.min(visibleNodes, d => d.y0) ?? 0;
    const ySpan = radius - yMin;

    function remapR(y: number): number {
      if (ySpan === 0) return CENTER_R;
      return CENTER_R + (y - yMin) / ySpan * (radius - CENTER_R);
    }

    // Color scale for top-level children.
    const depth1Nodes = hier.children ?? [];
    const colorOrdinal = d3.scaleOrdinal<string>()
      .domain(depth1Nodes.map(d => d.data.code))
      .range(d3.quantize(d3.interpolateSinebow, Math.max(depth1Nodes.length, 1)));

    function getColor(d: PartitionNode): string {
      let ancestor: PartitionNode = d;
      while (ancestor.depth > 1 && ancestor.parent) {
        ancestor = ancestor.parent as PartitionNode;
      }
      const base = colorOrdinal(ancestor.data.code);
      if (d.depth === 2) {
        const hsl = d3.hsl(base);
        return d3.hsl(hsl.h, hsl.s * 0.65, Math.min(hsl.l + 0.22, 0.93)).toString();
      }
      return base;
    }

    const arc = d3.arc<PartitionNode>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(0.005)
      .padRadius(CENTER_R)
      .innerRadius(d => remapR(d.y0))
      .outerRadius(d => remapR(d.y1) - 1);

    // Draw arcs.
    g.selectAll<SVGPathElement, PartitionNode>('path.arc')
      .data(visibleNodes)
      .join('path')
      .attr('class', 'arc')
      .attr('d', arc)
      .attr('fill', d => getColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .style('cursor', d => (d.depth === 1 && d.children) ? 'pointer' : 'default')
      .on('click', (_event, d) => {
        if (d.depth === 1 && d.children) handleDrillDown(d.data);
      })
      .on('mousemove', (event, d) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          visible: true,
          name: d.data.name,
          value: d.data.value,
        });
      })
      .on('mouseleave', () => setTooltip(t => ({ ...t, visible: false })));

    // Labels for depth-1 arcs with sufficient angular span.
    g.selectAll<SVGTextElement, PartitionNode>('text.arc-label')
      .data(visibleNodes.filter(d => d.depth === 1 && (d.x1 - d.x0) > MIN_LABEL_ANGLE))
      .join('text')
      .attr('class', 'arc-label')
      .attr('transform', d => {
        const angle = (d.x0 + d.x1) / 2;
        const rMid  = (remapR(d.y0) + remapR(d.y1)) / 2;
        const x = Math.sin(angle) * rMid;
        const y = -Math.cos(angle) * rMid;
        const deg  = angle * 180 / Math.PI - 90;
        const flip = (deg > 90 && deg < 270) ? 180 : 0;
        return `translate(${x},${y}) rotate(${deg + flip})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', 11)
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => shortLanName(d.data.name))
      .each(function(d) {
        const el = this as SVGTextElement;
        const rMid   = (remapR(d.y0) + remapR(d.y1)) / 2;
        const arcLen = rMid * (d.x1 - d.x0) - 8; // 8px padding on each side
        if (el.getComputedTextLength() <= arcLen) return;
        let text = shortLanName(d.data.name);
        while (text.length > 2 && el.getComputedTextLength() > arcLen) {
          text = text.slice(0, -1);
          el.textContent = text + '…';
        }
      });

    // Center background circle.
    g.append('circle')
      .attr('r', CENTER_R - 2)
      .attr('fill', '#fff')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1)
      .style('cursor', history.length > 0 ? 'pointer' : 'default')
      .on('click', () => { if (history.length > 0) handleBack(); });

    // Center: name.
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.4em')
      .attr('font-size', Math.min(13, CENTER_R * 0.22))
      .attr('font-weight', '600')
      .attr('fill', '#1f2937')
      .attr('pointer-events', 'none')
      .text(focus.name);

    // Center: value.
    const formatted = focus.value >= 1_000_000
      ? `${(focus.value / 1_000_000).toFixed(1)}M`
      : focus.value >= 1_000
        ? `${(focus.value / 1_000).toFixed(0)}k`
        : focus.value.toLocaleString('sv-SE');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .attr('font-size', Math.min(11, CENTER_R * 0.18))
      .attr('fill', '#6b7280')
      .attr('pointer-events', 'none')
      .text(`${formatted} ${unit}`);

    if (history.length > 0) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '2.6em')
        .attr('font-size', 10)
        .attr('fill', '#3b82f6')
        .attr('pointer-events', 'none')
        .text('← tillbaka');
    }

  }, [focus, dimensions, history.length, unit, label]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <Tooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
        <span className="font-medium">{tooltip.name}</span>
        <span className="ml-2 text-gray-300">
          {tooltip.value.toLocaleString('sv-SE')} {unit}
        </span>
      </Tooltip>
    </div>
  );
};
