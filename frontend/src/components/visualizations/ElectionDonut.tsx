import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { DonutChart } from './DonutChart';

export interface ElectionDonutProps {
  votes: Record<string, number>;
  size?:  number;
  topN?:  number;
}

export function ElectionDonut({ votes, size = 48, topN }: ElectionDonutProps) {
  const items = PARTY_CODES
    .map(p => ({
      code:  p,
      label: PARTY_LABELS[p] ?? p,
      value: votes[p] ?? 0,
      color: PARTY_COLORS[p] ?? '#ccc',
    }))
    .filter(d => d.value > 0);

  const winner = items.length > 0 ? items.reduce((a, b) => a.value > b.value ? a : b) : null;

  return (
    <DonutChart
      items={items}
      size={size}
      topN={topN}
      centerLabel={winner ? (winner.code === 'ÖVRIGA' ? 'Övr.' : winner.code) : undefined}
      centerSub={winner ? `${winner.value.toFixed(0)}%` : undefined}
    />
  );
}
