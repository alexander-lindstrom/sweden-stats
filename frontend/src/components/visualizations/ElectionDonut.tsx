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

  return (
    <DonutChart
      items={items}
      size={size}
      topN={topN}
      valueIsShare
      holeRatio={0.35}
    />
  );
}
