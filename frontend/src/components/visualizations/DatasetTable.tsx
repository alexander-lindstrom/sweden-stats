import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScalarDatasetResult } from '@/datasets/types';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { useTableSort, tableRowClass, TH } from '@/hooks/useTableSort';
import { SortIndicator } from '@/components/ui/SortIndicator';

interface DatasetTableProps {
  data: ScalarDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
  comparisonFeature?: { code: string; label: string } | null;
  onComparisonSelect?: (f: { code: string; label: string } | null) => void;
  matchingAreas?: Set<string> | null;
}

type SortKey = 'name' | 'value';

const ROW_HEIGHT = 36;

export const DatasetTable: React.FC<DatasetTableProps> = ({ data, selectedFeature, onFeatureSelect, comparisonFeature, onComparisonSelect, matchingAreas }) => {
  const { sortKey, sortDir, handleSort } = useTableSort<SortKey>('value', 'desc');
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() =>
    Object.entries(data.values).map(([code, value]) => ({
      code,
      name: stripLanSuffix(data.labels[code] ?? code),
      value,
    })),
    [data],
  );

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    // When filter is active, matching rows float to the top.
    if (matchingAreas) {
      const aMatch = matchingAreas.has(a.code) ? 0 : 1;
      const bMatch = matchingAreas.has(b.code) ? 0 : 1;
      if (aMatch !== bMatch) { return aMatch - bMatch; }
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') { return dir * a.name.localeCompare(b.name, 'sv'); }
    return dir * (a.value - b.value);
  }), [rows, sortKey, sortDir, matchingAreas]);

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
            <th className={`text-right pr-4 ${TH}`} onClick={() => handleSort('value')}>
              {data.label} <SortIndicator active={sortKey === 'value'} dir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr><td style={{ height: paddingTop }} /></tr>}
          {virtualItems.map(virtualRow => {
            const row = sorted[virtualRow.index];
            const isSelected   = row.code === selectedFeature?.code;
            const isComparison = row.code === comparisonFeature?.code;
            const isDimmed     = matchingAreas != null && !matchingAreas.has(row.code);
            return (
              <tr
                key={row.code}
                onClick={(e) => {
                  if (e.shiftKey) {
                    onComparisonSelect?.(isComparison ? null : { code: row.code, label: row.name });
                  } else {
                    onFeatureSelect?.(isSelected ? null : { code: row.code, label: row.name });
                  }
                }}
                className={[
                  tableRowClass(isSelected, !!(onFeatureSelect || onComparisonSelect)),
                  isComparison ? '!bg-orange-50' : '',
                  isDimmed ? 'opacity-30' : '',
                ].join(' ')}
              >
                <td className="text-right pr-4 py-2 text-gray-400 tabular-nums text-xs">{virtualRow.index + 1}</td>
                <td className="py-2 text-gray-800">{row.name}</td>
                <td className="text-right pr-4 py-2 text-gray-700 tabular-nums">
                  {row.value.toLocaleString('sv-SE')}
                  <span className="text-gray-400 ml-1 text-xs">{data.unit}</span>
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} /></tr>}
        </tbody>
      </table>
    </div>
  );
};
