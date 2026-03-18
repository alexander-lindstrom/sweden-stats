type SortDir = 'asc' | 'desc';

/** Sort direction indicator shown in column headers. */
export function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) { return <span className="text-gray-300 ml-1">↕</span>; }
  return <span className="text-blue-500 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}
