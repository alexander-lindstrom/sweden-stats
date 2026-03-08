import React from 'react';
import { ElectionDatasetResult } from '@/datasets/types';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { useTableSort, useScrollSelectedIntoView, SortIndicator, tableRowClass, TH } from '@/hooks/useTableSort';

interface Props {
  data: ElectionDatasetResult;
  selectedFeature?: { code: string; label: string } | null;
  onFeatureSelect?: (f: { code: string; label: string } | null) => void;
}

// SortKey is 'name' | 'winner' (by winner share) | a party code
type SortKey = string;

export const ElectionTable: React.FC<Props> = ({ data, selectedFeature, onFeatureSelect }) => {
  // Default: strongest winner share first — mirrors scalar table's "value desc" default.
  const { sortKey, sortDir, handleSort } = useTableSort<SortKey>('winner', 'desc');
  const selectedRowRef = useScrollSelectedIntoView(selectedFeature?.code);

  // Build ordered party columns: main parties that have any votes, then local parties
  // that WIN at least one area (to keep column count manageable), then ÖVRIGA.
  const winners = new Set(Object.values(data.winnerByGeo));
  const allPresent = new Set(
    Object.values(data.partyVotes).flatMap(votes => Object.keys(votes).filter(p => votes[p] > 0)),
  );
  const mainPresent  = PARTY_CODES.filter(p => p !== 'ÖVRIGA' && allPresent.has(p));
  const localPresent = [...winners]
    .filter(p => !(PARTY_CODES as readonly string[]).includes(p) && p !== 'ÖVRIGA')
    .sort((a, b) => a.localeCompare(b, 'sv'));
  const hasOvriga    = allPresent.has('ÖVRIGA');
  const presentParties = [...mainPresent, ...localPresent, ...(hasOvriga ? ['ÖVRIGA'] : [])];

  const rows = Object.entries(data.partyVotes).map(([code, votes]) => {
    const winner      = data.winnerByGeo[code] ?? '';
    const winnerShare = votes[winner] ?? 0;
    return { code, name: stripLanSuffix(data.labels[code] ?? code), winner, winnerShare, votes };
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')   { return dir * a.name.localeCompare(b.name, 'sv'); }
    if (sortKey === 'winner') { return dir * (a.winnerShare - b.winnerShare); }
    return dir * ((a.votes[sortKey] ?? 0) - (b.votes[sortKey] ?? 0));
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
        </tbody>
      </table>
    </div>
  );
};
