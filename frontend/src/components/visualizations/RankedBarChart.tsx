import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { stripCommonPrefix, stripLanSuffix, stripOuterParens } from '@/utils/labelFormatting';

interface Hovered { name: string; value: number; x: number; y: number; }

interface RankedBarChartProps {
  data: DatasetResult;
  colorScale?: ((value: number) => string) | null;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
}

const MARGIN = { top: 8, right: 80, bottom: 28, left: 148 };
const ROW_HEIGHT = 28;
const BAR_RADIUS = 3;

export const RankedBarChart: React.FC<RankedBarChartProps> = ({ data, colorScale, selectedFeature, onFeatureSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  const hoveredElRef = useRef<SVGRectElement | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const sorted = useMemo(() => {
    const raw = Object.entries(data.values)
      .map(([code, value]) => ({ code, value, name: stripLanSuffix(data.labels[code] ?? code) }))
      .sort((a, b) => b.value - a.value);
    const stripped = stripCommonPrefix(raw.map(d => d.name)).map(stripOuterParens);
    return raw.map((d, i) => ({ ...d, name: stripped[i] }));
  }, [data.values, data.labels]);

  const idealHeight = sorted.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom;
  const containerH  = dimensions?.height ?? 0;
  const svgHeight   = containerH > 0 ? Math.min(idealHeight, containerH) : idealHeight;
  const svgWidth    = dimensions?.width ?? 0;

  useEffect(() => {
    if (!svgRef.current || svgWidth === 0 || sorted.length === 0) {
      return;
    }

    const innerW = svgWidth  - MARGIN.left - MARGIN.right;
    const innerH = svgHeight - MARGIN.top  - MARGIN.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width',  svgWidth)
      .attr('height', svgHeight)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sorted, d => d.value) ?? 1])
      .range([0, innerW])
      .nice();

    const yScale = d3.scaleBand()
      .domain(sorted.map(d => d.code))
      .range([0, innerH])
      .padding(0.25);

    // Bars
    g.selectAll('rect.bar')
      .data(sorted)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', d => yScale(d.code)!)
      .attr('width', d => xScale(d.value))
      .attr('height', yScale.bandwidth())
      .attr('rx', BAR_RADIUS)
      .attr('fill', d =>
        colorScale ? colorScale(d.value) : '#3b82f6'
      )
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

    // Value labels (right of bar)
    g.selectAll('text.val')
      .data(sorted)
      .join('text')
      .attr('class', 'val')
      .attr('x', d => xScale(d.value) + 6)
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', 11)
      .attr('fill', '#6b7280')
      .text(d => d.value.toLocaleString('sv-SE'));

    // Y-axis labels (region names)
    g.selectAll('text.label')
      .data(sorted)
      .join('text')
      .attr('class', 'label')
      .attr('x', -8)
      .attr('y', d => yScale(d.code)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 12)
      .attr('fill', '#374151')
      .text(d => d.name);

    // X-axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(4)
          .tickFormat(n => {
            const v = n.valueOf();
            if (v >= 1_000_000) {
              return `${(v / 1_000_000).toFixed(1)}M`;
            }
            if (v >= 1_000) {
              return `${(v / 1_000).toFixed(0)}k`;
            }
            return String(v);
          })
      )
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', '#e5e7eb'))
      .call(ax => ax.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 11));

    // Vertical grid lines
    g.selectAll('line.grid')
      .data(xScale.ticks(4))
      .join('line')
      .attr('class', 'grid')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#f3f4f6')
      .attr('stroke-width', 1);

    // Scroll the selected bar into view.
    if (selectedFeature && containerRef.current) {
      const idx = sorted.findIndex(d => d.code === selectedFeature.code);
      if (idx >= 0) {
        const barCenterY = MARGIN.top + yScale(sorted[idx].code)! + yScale.bandwidth() / 2;
        containerRef.current.scrollTop = barCenterY - containerRef.current.clientHeight / 2;
      }
    }
  }, [sorted, svgWidth, svgHeight, colorScale, selectedFeature, onFeatureSelect]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto">
      <svg ref={svgRef} />
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
