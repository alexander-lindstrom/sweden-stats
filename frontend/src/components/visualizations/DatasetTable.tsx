import React, { useState } from 'react';
import { DatasetResult } from '@/datasets/types';
import { stripLanSuffix } from '@/utils/labelFormatting';

interface DatasetTableProps {
  data: DatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
}

type SortKey = 'name' | 'value';
type SortDir = 'asc' | 'desc';

export const DatasetTable: React.FC<DatasetTableProps> = ({ data, selectedFeature, onFeatureSelect }) => {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = Object.entries(data.values).map(([code, value]) => ({
    code,
    name: stripLanSuffix(data.labels[code] ?? code),
    value,
  }));

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') {
      return dir * a.name.localeCompare(b.name, 'sv');
    }
    return dir * (a.value - b.value);
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'value' ? 'desc' : 'asc');
    }
  };

  const indicator = (key: SortKey) => {
    if (key !== sortKey) {
      return <span className="text-gray-300 ml-1">↕</span>;
    }
    return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-gray-200">
            <th className="w-10 text-right pr-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
              #
            </th>
            <th
              className="text-left py-2 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
              onClick={() => handleSort('name')}
            >
              Namn {indicator('name')}
            </th>
            <th
              className="text-right pr-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
              onClick={() => handleSort('value')}
            >
              {data.label} {indicator('value')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.code}
              onClick={() => onFeatureSelect?.(row.code === selectedFeature?.code ? null : { code: row.code, label: row.name })}
              className={[
                'border-b border-gray-100 transition-colors',
                onFeatureSelect ? 'cursor-pointer' : '',
                row.code === selectedFeature?.code ? 'bg-blue-50' : 'hover:bg-gray-50',
              ].join(' ')}
            >
              <td className="text-right pr-4 py-2 text-gray-400 tabular-nums text-xs">
                {i + 1}
              </td>
              <td className="py-2 text-gray-800">{row.name}</td>
              <td className="text-right pr-4 py-2 text-gray-700 tabular-nums">
                {row.value.toLocaleString('sv-SE')}
                <span className="text-gray-400 ml-1 text-xs">{data.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
