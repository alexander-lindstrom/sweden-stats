import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';

export interface ElectionDonutProps {
  votes: Record<string, number>;
  size?:  number;
  topN?:  number;
}

export function ElectionDonut({ votes, size = 48, topN }: ElectionDonutProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const DONUT_R    = size;
  const DONUT_HOLE = Math.round(DONUT_R * (27 / 48));
  const DONUT_SIZE = DONUT_R * 2 + 4;

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rows = PARTY_CODES
      .map(p => ({ party: p, share: votes[p] ?? 0 }))
      .filter(d => d.share > 0);

    if (rows.length === 0) { return; }

    const pie = d3.pie<typeof rows[0]>().sort(null).value(d => d.share);
    const arc = d3.arc<d3.PieArcDatum<typeof rows[0]>>().innerRadius(DONUT_HOLE).outerRadius(DONUT_R);

    const g = svg
      .attr('width', DONUT_SIZE).attr('height', DONUT_SIZE)
      .append('g').attr('transform', `translate(${DONUT_SIZE / 2},${DONUT_SIZE / 2})`);

    g.selectAll('path')
      .data(pie(rows))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => PARTY_COLORS[d.data.party] ?? '#ccc')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    const winner = rows.reduce((a, b) => a.share > b.share ? a : b);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.2em')
      .attr('font-size', 13).attr('font-weight', 700).attr('fill', '#1e293b')
      .text(winner.party === 'ÖVRIGA' ? 'Övr.' : winner.party);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('font-size', 10).attr('fill', '#64748b')
      .text(`${winner.share.toFixed(0)}%`);
  }, [votes, DONUT_R, DONUT_HOLE, DONUT_SIZE]);

  const allParties = PARTY_CODES
    .map(p => ({ p, share: votes[p] ?? 0 }))
    .filter(d => d.share > 0.5)
    .sort((a, b) => b.share - a.share);

  const displayParties = topN !== undefined ? allParties.slice(0, topN) : allParties;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg ref={svgRef} width={DONUT_SIZE} height={DONUT_SIZE} className="flex-shrink-0" />
      <div className="w-full space-y-1">
        {displayParties.map(({ p, share }) => (
          <div key={p} className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PARTY_COLORS[p] }} />
            <span className="text-slate-500 truncate flex-1 min-w-0">{PARTY_LABELS[p] ?? p}</span>
            <span className="tabular-nums text-slate-700 flex-shrink-0">{share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
