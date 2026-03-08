import { useState } from 'react';

type SortDir = 'asc' | 'desc';

/**
 * Manages sort key + direction state for a table.
 * Convention: 'name' columns default to ascending; all others default to descending.
 */
export function useTableSort<K extends string>(defaultKey: K, defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const handleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  return { sortKey, sortDir, handleSort };
}

/** Sort direction indicator shown in column headers. */
export function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) { return <span className="text-gray-300 ml-1">↕</span>; }
  return <span className="text-blue-500 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

/** Consistent row className for all data tables. */
export function tableRowClass(isSelected: boolean, clickable: boolean): string {
  return [
    'border-b border-gray-100 transition-colors',
    clickable ? 'cursor-pointer' : '',
    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
  ].join(' ');
}

/** Consistent sortable column header className. */
export const TH = 'py-2 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap';
