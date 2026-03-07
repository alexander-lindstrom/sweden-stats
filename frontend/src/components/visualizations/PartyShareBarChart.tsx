import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ElectionDatasetResult } from '@/datasets/types';
import useResizeObserver from '@/hooks/useResizeObserver';
import { PARTY_CODES, PARTY_COLORS } from '@/datasets/parties';

interface Props {
  data:            ElectionDatasetResult;
  selectedFeature: { code: string; label: string } | null | undefined;
  onFeatureSelect: (f: { code: string; label: string } | null) => void;
}

const MARGIN  = { top: 8, right: 16, bottom: 44, left: 144 };
const BAR_H   = 22;
const BAR_GAP = 4;

/**
 * Stacked 100% horizontal bar chart — one row per geo area.
 * Rows are grouped by winning party (canonical order), then sorted by winner share desc.
 * A party legend sits at the bottom. Clicking a row selects that feature.
 */
export const PartyShareBarChart: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dims         = useResizeObserver(containerRef);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!dims) { return; }

    const codes = Object.keys(data.partyVotes);
    if (codes.length === 0) { return; }

    // Sort by winning party (canonical order) then by winner share desc.
    const partyOrder = Object.fromEntries(PARTY_CODES.map((p, i) => [p, i]));
    const sorted = codes.slice().sort((a, b) => {
      const wa = data.winnerByGeo[a] ?? 'ÖVRIGA';
      const wb = data.winnerByGeo[b] ?? 'ÖVRIGA';
      const orderDiff = (partyOrder[wa] ?? 99) - (partyOrder[wb] ?? 99);
      if (orderDiff !== 0) { return orderDiff; }
      return (data.partyVotes[b][wb] ?? 0) - (data.partyVotes[a][wa] ?? 0);
    });

    const innerW = dims.width - MARGIN.left - MARGIN.right;
    const innerH = sorted.length * (BAR_H + BAR_GAP);
    const totalH = innerH + MARGIN.top + MARGIN.bottom;

    svg.attr('width', dims.width).attr('height', totalH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    sorted.forEach((code, i) => {
      const y          = i * (BAR_H + BAR_GAP);
      const shares     = data.partyVotes[code];
      const isSelected = selectedFeature?.code === code;
      const label      = data.labels[code] ?? code;

      // Stacked segments (only parties with a share > 0).
      let xOffset = 0;
      PARTY_CODES.filter(p => (shares[p] ?? 0) > 0).forEach(party => {
        const w = (shares[party] / 100) * innerW;
        g.append('rect')
          .attr('x', xOffset).attr('y', y)
          .attr('width', w).attr('height', BAR_H)
          .attr('fill', PARTY_COLORS[party] ?? '#ccc')
          .attr('opacity', isSelected ? 1 : 0.85);
        xOffset += w;
      });

      // Selection highlight outline.
      if (isSelected) {
        g.append('rect')
          .attr('x', -2).attr('y', y - 1)
          .attr('width', innerW + 4).attr('height', BAR_H + 2)
          .attr('fill', 'none')
          .attr('stroke', '#1e40af').attr('stroke-width', 1.5).attr('rx', 2);
      }

      // Transparent click target.
      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', innerW).attr('height', BAR_H)
        .attr('fill', 'transparent').attr('cursor', 'pointer')
        .on('click', () => onFeatureSelect({ code, label }));

      // Area label (left).
      g.append('text')
        .attr('x', -8).attr('y', y + BAR_H / 2)
        .attr('dy', '0.35em').attr('text-anchor', 'end')
        .attr('font-size', 11)
        .attr('fill', isSelected ? '#1e40af' : '#475569')
        .attr('font-weight', isSelected ? 600 : 400)
        .text(label);

      // Winner share % label inside the leading segment (if wide enough).
      const winner      = data.winnerByGeo[code];
      const winnerShare = shares[winner] ?? 0;
      const winnerW     = (winnerShare / 100) * innerW;
      if (winnerW > 32) {
        g.append('text')
          .attr('x', winnerW / 2).attr('y', y + BAR_H / 2)
          .attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('font-size', 10).attr('fill', 'rgba(255,255,255,0.88)')
          .attr('pointer-events', 'none')
          .text(`${winnerShare.toFixed(0)}%`);
      }
    });

    // Party legend at the bottom.
    const presentParties = PARTY_CODES.filter(p =>
      codes.some(c => (data.partyVotes[c][p] ?? 0) > 0),
    );
    const ITEM_W     = 52;
    const legendW    = presentParties.length * ITEM_W;
    const legendX    = Math.max(0, (innerW - legendW) / 2);
    const legend     = g.append('g').attr('transform', `translate(${legendX},${innerH + 14})`);

    presentParties.forEach((p, i) => {
      const x = i * ITEM_W;
      legend.append('rect').attr('x', x).attr('y', 0).attr('width', 10).attr('height', 10)
        .attr('fill', PARTY_COLORS[p]).attr('rx', 2);
      legend.append('text').attr('x', x + 13).attr('y', 5).attr('dy', '0.35em')
        .attr('font-size', 10).attr('fill', '#64748b')
        .text(p === 'ÖVRIGA' ? 'Övr.' : p);
    });

  }, [data, selectedFeature, dims, onFeatureSelect]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
};
