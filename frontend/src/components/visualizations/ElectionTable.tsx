import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ElectionDatasetResult } from '@/datasets/types';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { useTableSort, tableRowClass, TH } from '@/hooks/useTableSort';
import { SortIndicator } from '@/components/ui/SortIndicator';

interface Props {
  data: ElectionDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
}

type SortKey = string;

const ROW_HEIGHT = 36;

interface TooltipState { x: number; y: number; rowIdx: number; }

export const ElectionTable: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect }) => {
  const { sortKey, sortDir, handleSort } = useTableSort<SortKey>('name', 'asc');
  const parentRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build ordered party columns: main parties that have any votes, then local parties
  // that WIN at least one area (to keep column count manageable), then ÖVRIGA.
  const presentParties = useMemo(() => {
    const winners = new Set(Object.values(data.winnerByGeo));
    const allPresent = new Set(
      Object.values(data.partyVotes).flatMap(votes => Object.keys(votes).filter(p => votes[p] > 0)),
    );
    const mainPresent  = PARTY_CODES.filter(p => p !== 'ÖVRIGA' && allPresent.has(p));
    const localPresent = [...winners]
      .filter(p => !(PARTY_CODES as readonly string[]).includes(p) && p !== 'ÖVRIGA')
      .sort((a, b) => a.localeCompare(b, 'sv'));
    const hasOvriga = allPresent.has('ÖVRIGA');
    return [...mainPresent, ...localPresent, ...(hasOvriga ? ['ÖVRIGA'] : [])];
  }, [data]);

  const rows = useMemo(() =>
    Object.entries(data.partyVotes).map(([code, votes]) => ({
      code, name: stripLanSuffix(data.labels[code] ?? code), votes,
    })),
    [data],
  );

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') { return dir * a.name.localeCompare(b.name, 'sv'); }
    return dir * ((a.votes[sortKey] ?? 0) - (b.votes[sortKey] ?? 0));
  }), [rows, sortKey, sortDir]);

  const tooltipRow = tooltip !== null ? sorted[tooltip.rowIdx] : null;

  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const selectedIdx    = useMemo(
    () => sorted.findIndex(r => r.code === selectedFeature?.code),
    [sorted, selectedFeature?.code],
  );
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;

  // Scroll only when the selected code changes, not when a sort reorders the table.
  const selectedCode = selectedFeature?.code ?? null;
  useEffect(() => {
    if (selectedCode !== null && selectedIdxRef.current >= 0) {
      rowVirtualizer.scrollToIndex(selectedIdxRef.current, { align: 'auto' });
    }
  }, [selectedCode, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop    = virtualItems.length > 0 ? virtualItems[0].start                              : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <>
    <div ref={parentRef} className="w-full h-full overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-gray-200">
            <th className="w-10 text-right pr-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
              #
            </th>
            <th className={`text-left ${TH}`} onClick={() => handleSort('name')}>
              Namn <SortIndicator active={sortKey === 'name'} dir={sortDir} />
            </th>
            {presentParties.map(p => (
              <th key={p} className={`text-right px-2 ${TH}`} onClick={() => handleSort(p)}>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
                    style={{ backgroundColor: PARTY_COLORS[p] }}
                  />
                  {p === 'ÖVRIGA' ? 'Övr.' : p}
                  <SortIndicator active={sortKey === p} dir={sortDir} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr><td style={{ height: paddingTop }} /></tr>}
          {virtualItems.map(virtualRow => {
            const row = sorted[virtualRow.index];
            const isSelected = row.code === selectedFeature?.code;
            return (
              <tr
                key={row.code}
                onClick={() => onFeatureSelect?.(isSelected ? null : { code: row.code, label: row.name })}
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, rowIdx: virtualRow.index })}
                onMouseMove={(e) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => setTooltip(null)}
                className={tableRowClass(isSelected, !!onFeatureSelect)}
              >
                <td className="text-right pr-4 py-2 text-gray-400 tabular-nums text-xs">{virtualRow.index + 1}</td>
                <td className="py-2 text-gray-800 whitespace-nowrap">{row.name}</td>
                {presentParties.map(p => (
                  <td key={p} className="text-right px-2 py-2 tabular-nums text-xs">
                    {(row.votes[p] ?? 0) > 0
                      ? <span className="text-gray-700">{row.votes[p].toFixed(1)}<span className="text-gray-400 ml-0.5">%</span></span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} /></tr>}
        </tbody>
      </table>
    </div>
    {tooltipRow && tooltip && (
      <div
        className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-3 py-2 shadow-lg"
        style={{ left: tooltip.x + 14, top: tooltip.y - 10, minWidth: 200 }}
      >
        <div className="font-semibold mb-1.5 text-slate-100">{tooltipRow.name}</div>
        <div className="space-y-0.5">
          {presentParties.map(p => {
            const share = tooltipRow.votes[p] ?? 0;
            if (share === 0) { return null; }
            return (
              <div key={p} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PARTY_COLORS[p] ?? '#ccc' }} />
                <span className="text-slate-300">{PARTY_LABELS[p] ?? p}</span>
                <span className="ml-auto tabular-nums text-slate-100 pl-4">{share.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
};
