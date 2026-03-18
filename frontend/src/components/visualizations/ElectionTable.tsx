import React, { useEffect, useMemo, useRef } from 'react';
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

export const ElectionTable: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect }) => {
  const { sortKey, sortDir, handleSort } = useTableSort<SortKey>('winner', 'desc');
  const parentRef = useRef<HTMLDivElement>(null);

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
    Object.entries(data.partyVotes).map(([code, votes]) => {
      const winner      = data.winnerByGeo[code] ?? '';
      const winnerShare = votes[winner] ?? 0;
      return { code, name: stripLanSuffix(data.labels[code] ?? code), winner, winnerShare, votes };
    }),
    [data],
  );

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')   { return dir * a.name.localeCompare(b.name, 'sv'); }
    if (sortKey === 'winner') { return dir * (a.winnerShare - b.winnerShare); }
    return dir * ((a.votes[sortKey] ?? 0) - (b.votes[sortKey] ?? 0));
  }), [rows, sortKey, sortDir]);

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
            <th className={`text-left px-3 ${TH}`} onClick={() => handleSort('winner')}>
              Vinnare <SortIndicator active={sortKey === 'winner'} dir={sortDir} />
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
                className={tableRowClass(isSelected, !!onFeatureSelect)}
              >
                <td className="text-right pr-4 py-2 text-gray-400 tabular-nums text-xs">{virtualRow.index + 1}</td>
                <td className="py-2 text-gray-800 whitespace-nowrap">{row.name}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: PARTY_COLORS[row.winner] ?? '#ccc' }}
                    />
                    <span className="text-gray-700 text-xs">{PARTY_LABELS[row.winner] ?? row.winner}</span>
                    <span className="text-gray-400 text-xs tabular-nums">{row.winnerShare.toFixed(1)}%</span>
                  </span>
                </td>
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
  );
};
