import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ElectionDatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';

interface Props {
  data:            ElectionDatasetResult;
  selectedFeature: { code: string; label: string } | null | undefined;
}

const MARGIN = { top: 16, right: 64, bottom: 16, left: 152 };
const BAR_H  = 28;
const BAR_GAP = 6;

export const PartyShareBarChart: React.FC<Props> = ({ data, selectedFeature }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dims         = useResizeObserver(containerRef);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!dims) { return; }

    // Determine which geo code to display.
    const code = selectedFeature?.code ?? null;
    const shares = code ? data.partyVotes[code] : null;

    if (!shares) {
      svg.attr('width', dims.width).attr('height', 80);
      svg.append('text')
        .attr('x', dims.width / 2).attr('y', 44)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', 14)
        .text('Välj en region eller kommun på kartan');
      return;
    }

    // Sort parties by share descending; skip parties with 0 votes.
    const rows = PARTY_CODES
      .map(p => ({ party: p, share: shares[p] ?? 0 }))
      .filter(r => r.share > 0)
      .sort((a, b) => b.share - a.share);

    const innerW  = dims.width - MARGIN.left - MARGIN.right;
    const innerH  = rows.length * (BAR_H + BAR_GAP);
    const totalH  = innerH + MARGIN.top + MARGIN.bottom;

    svg.attr('width', dims.width).attr('height', totalH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, Math.max(d3.max(rows, r => r.share) ?? 0, 10)])
      .range([0, innerW])
      .clamp(true);

    const yScale = d3.scaleBand()
      .domain(rows.map(r => r.party))
      .range([0, innerH])
      .paddingInner(BAR_GAP / (BAR_H + BAR_GAP));

    // Bars
    g.selectAll<SVGRectElement, typeof rows[0]>('rect.bar')
      .data(rows)
      .join('rect').attr('class', 'bar')
      .attr('x', 0)
      .attr('y', r => yScale(r.party) ?? 0)
      .attr('width',  r => Math.max(2, xScale(r.share)))
      .attr('height', yScale.bandwidth())
      .attr('rx', 3)
      .attr('fill', r => PARTY_COLORS[r.party] ?? '#ccc');

    // Party labels (left)
    g.selectAll<SVGTextElement, typeof rows[0]>('text.label')
      .data(rows)
      .join('text').attr('class', 'label')
      .attr('x', -8)
      .attr('y', r => (yScale(r.party) ?? 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', 12)
      .attr('fill', '#475569')
      .text(r => PARTY_LABELS[r.party] ?? r.party);

    // Value labels (right of bar)
    g.selectAll<SVGTextElement, typeof rows[0]>('text.value')
      .data(rows)
      .join('text').attr('class', 'value')
      .attr('x', r => xScale(r.share) + 5)
      .attr('y', r => (yScale(r.party) ?? 0) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', 12)
      .attr('fill', '#64748b')
      .text(r => `${r.share.toFixed(1)}%`);

    // Feature label as title
    const areaName = (code ? data.labels[code] : null) ?? selectedFeature?.label ?? '';
    svg.append('text')
      .attr('x', MARGIN.left)
      .attr('y', 13)
      .attr('font-size', 12)
      .attr('fill', '#94a3b8')
      .attr('font-weight', 600)
      .text(areaName);

  }, [data, selectedFeature, dims]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
};
