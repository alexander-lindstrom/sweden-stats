import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import useResizeObserver from '@/hooks/useResizeObserver';

export interface DonutItem {
  code:  string;
  label: string;
  value: number;
  color: string;
}

interface TooltipState {
  x:     number;
  y:     number;
  item:  DonutItem;
  share: number;
}

interface Props {
  items:           DonutItem[];
  centerLabel?:    string;
  centerSub?:      string;
  /** Outer radius in px. Default 48 (matches panel usage). */
  size?:           number;
  /** Ratio of inner hole to outer radius. Default 27/48 ≈ 0.56. */
  holeRatio?:      number;
  /** Limit legend rows to top N items by value. */
  topN?:           number;
  /**
   * When true, `value` is itself a share/percentage — tooltip shows only `share%`
   * instead of `count (share%)`. Use for election donuts where value is already a %.
   */
  valueIsShare?:   boolean;
  /** Where to place the legend. Default 'below'. */
  legendPosition?: 'below' | 'right';
  /** When true, show formatted absolute value alongside % in legend rows. */
  showCount?:      boolean;
}

/**
 * Generic donut chart. Slices are drawn by D3; tooltip and legend are React.
 * Used directly for visualisation-area charts (large size) and as the
 * rendering core of ElectionDonut (small, panel size).
 */
export function DonutChart({
  items,
  centerLabel,
  centerSub,
  size            = 48,
  holeRatio       = 27 / 48,
  topN,
  valueIsShare    = false,
  legendPosition  = 'below',
  showCount       = false,
}: Props) {
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const dims = useResizeObserver(containerRef);

  const DONUT_R    = size;
  const DONUT_HOLE = Math.round(DONUT_R * holeRatio);
  const DONUT_SIZE = DONUT_R * 2 + 4;

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Sort largest first so the dominant slice starts at 12 o'clock.
    const visible = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    if (visible.length === 0) { return; }

    const total = visible.reduce((s, i) => s + i.value, 0);

    const pie = d3.pie<DonutItem>().sort(null).value(d => d.value);
    const arc = d3.arc<d3.PieArcDatum<DonutItem>>().innerRadius(DONUT_HOLE).outerRadius(DONUT_R);

    const g = svg
      .attr('width', DONUT_SIZE).attr('height', DONUT_SIZE)
      .append('g').attr('transform', `translate(${DONUT_SIZE / 2},${DONUT_SIZE / 2})`);

    g.selectAll('path')
      .data(pie(visible))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .on('mousemove', function (event: MouseEvent, d) {
        const container = containerRef.current!.getBoundingClientRect();
        setTooltip({
          x:     event.clientX - container.left + 12,
          y:     event.clientY - container.top  - 8,
          item:  d.data,
          share: d.data.value / total * 100,
        });
      })
      .on('mouseleave', () => setTooltip(null));

    // Center text.
    if (centerLabel) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', centerSub ? '-0.3em' : '0.35em')
        .attr('font-size', Math.round(size * 13 / 48))
        .attr('font-weight', 700)
        .attr('fill', '#1e293b')
        .text(centerLabel);
    }
    if (centerSub) {
      g.append('text')
        .attr('text-anchor', 'middle').attr('dy', '1.1em')
        .attr('font-size', Math.round(size * 8 / 48))
        .attr('font-weight', 400)
        .attr('fill', '#94a3b8')
        .text(centerSub);
    }
  }, [items, size, centerLabel, centerSub, DONUT_HOLE, DONUT_R, DONUT_SIZE]);

  const effectiveLegendPos = legendPosition === 'right' && dims && dims.width < DONUT_SIZE + 80
    ? 'below'
    : legendPosition;

  const total       = items.reduce((s, i) => s + i.value, 0);
  const sortedItems = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const legendItems = topN !== undefined ? sortedItems.slice(0, topN) : sortedItems;

  const legendEl = (
    <div className={effectiveLegendPos === 'right' ? 'flex flex-col justify-center space-y-1.5' : 'w-full space-y-1'}>
      {legendItems.map(item => {
        const share = total > 0 ? item.value / total * 100 : 0;
        return (
          <div key={item.code} className="flex items-baseline gap-1.5 text-xs min-w-0">
            <span className="w-2 h-2 rounded-sm flex-shrink-0 self-center" style={{ backgroundColor: item.color }} />
            <span className={effectiveLegendPos === 'right' ? 'text-slate-600 flex-shrink-0' : 'text-slate-500 truncate flex-1 min-w-0'}>
              {item.label}
            </span>
            {effectiveLegendPos === 'right' && (
              <span className="flex-1 border-b border-dotted border-slate-300 min-w-[16px]" />
            )}
            {showCount && (
              <span className="tabular-nums text-slate-400 flex-shrink-0">
                {item.value.toLocaleString('sv-SE')}
              </span>
            )}
            <span className={`tabular-nums text-slate-700 flex-shrink-0 ${effectiveLegendPos !== 'right' && !showCount ? 'ml-auto' : ''}`}>
              {share.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} className="w-full relative">
      <div
        className={effectiveLegendPos === 'right' ? 'flex flex-row items-center justify-center gap-8' : 'flex flex-col items-center gap-3'}
      >
        <svg ref={svgRef} width={DONUT_SIZE} height={DONUT_SIZE} className="flex-shrink-0" />
        {legendEl}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-slate-800 text-white rounded-md shadow-lg px-3 py-2 text-xs"
          style={{ left: tooltip.x, top: tooltip.y, maxWidth: 240 }}
        >
          <div className="font-semibold text-slate-100">{tooltip.item.label}</div>
          <div className="text-slate-300 mt-0.5">
            {valueIsShare
              ? `${tooltip.share.toFixed(1)}%`
              : `${tooltip.item.value.toLocaleString('sv-SE')} (${tooltip.share.toFixed(1)}%)`
            }
          </div>
        </div>
      )}
    </div>
  );
}
