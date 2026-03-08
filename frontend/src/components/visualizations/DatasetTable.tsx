import React from 'react';
import { ScalarDatasetResult } from '@/datasets/types';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { useTableSort, useScrollSelectedIntoView, SortIndicator, tableRowClass, TH } from '@/hooks/useTableSort';

interface DatasetTableProps {
  data: ScalarDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
}

type SortKey = 'name' | 'value';

export const DatasetTable: React.FC<DatasetTableProps> = ({ data, selectedFeature, onFeatureSelect }) => {
  const { sortKey, sortDir, handleSort } = useTableSort<SortKey>('value', 'desc');
  const selectedRowRef = useScrollSelectedIntoView(selectedFeature?.code);

  const rows = Object.entries(data.values).map(([code, value]) => ({
    code,
    name: stripLanSuffix(data.labels[code] ?? code),
    value,
  }));

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') { return dir * a.name.localeCompare(b.name, 'sv'); }
    return dir * (a.value - b.value);
  });

  return (
    <div className="w-full h-full overflow-auto">
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
          {sorted.map((row, i) => {
            const isSelected = row.code === selectedFeature?.code;
            return (
              <tr
                key={row.code}
                ref={isSelected ? selectedRowRef : null}
                onClick={() => onFeatureSelect?.(isSelected ? null : { code: row.code, label: row.name })}
                className={tableRowClass(isSelected, !!onFeatureSelect)}
              >
                <td className="text-right pr-4 py-2 text-gray-400 tabular-nums text-xs">{i + 1}</td>
                <td className="py-2 text-gray-800">{row.name}</td>
                <td className="text-right pr-4 py-2 text-gray-700 tabular-nums">
                  {row.value.toLocaleString('sv-SE')}
                  <span className="text-gray-400 ml-1 text-xs">{data.unit}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
