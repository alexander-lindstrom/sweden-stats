import { useMemo } from 'react';
import type {
  AdminLevel, ChartType, CategoricalShareResult, CategoryShare,
  DatasetDescriptor, DatasetResult, ElectionDatasetResult,
} from '@/datasets/types';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';

export interface ElectionDerivedData {
  partyShareData: CategoricalShareResult | null;
  partyChoroplethValues: Record<string, number> | null;
  tooltipData: Record<string, string> | null;
  legendData: DatasetResult | { kind: 'scalar'; values: Record<string, number>; labels: Record<string, string>; label: string; unit: string } | null;
  partyRankingResult: { kind: 'scalar'; values: Record<string, number>; labels: Record<string, string>; label: string; unit: string } | null;
  rankingColorFn: ((code: string) => string) | null;
  rankingRowMeta: Record<string, string> | null;
  subElectionTooltip: Record<string, string> | null;
  partyColorOverrides: Map<string, string> | undefined;
}

export interface ElectionDerivedDataOpts {
  electionResult: ElectionDatasetResult | null;
  filteredElectionResult: ElectionDatasetResult | null;
  subElectionResult: ElectionDatasetResult | null;
  activeParty: string | null;
  activeChartType: ChartType;
  selectedLevel: AdminLevel;
  effectiveLan: string | null;
  activeDescriptor: DatasetDescriptor | null;
  datasetResult: DatasetResult | null;
}

/**
 * Pure-derivation hook: encapsulates all election-specific computed values.
 * No state or effects — only useMemo.
 */
export function useElectionDerivedData({
  electionResult,
  filteredElectionResult,
  subElectionResult,
  activeParty,
  activeChartType,
  selectedLevel,
  effectiveLan,
  activeDescriptor,
  datasetResult,
}: ElectionDerivedDataOpts): ElectionDerivedData {

  // Convert election result → CategoricalShareResult for the generic ShareBarChart.
  const partyShareData = useMemo((): CategoricalShareResult | null => {
    if (!filteredElectionResult) { return null; }
    const codes = Object.keys(filteredElectionResult.partyVotes);
    if (codes.length === 0) { return null; }

    const partyOrder = Object.fromEntries(PARTY_CODES.map((p, i) => [p, i]));
    const sortedCodes = codes.slice().sort((a, b) => {
      const wa = filteredElectionResult.winnerByGeo[a] ?? 'ÖVRIGA';
      const wb = filteredElectionResult.winnerByGeo[b] ?? 'ÖVRIGA';
      const orderDiff = (partyOrder[wa] ?? 99) - (partyOrder[wb] ?? 99);
      if (orderDiff !== 0) { return orderDiff; }
      return (filteredElectionResult.partyVotes[b][wb] ?? 0) - (filteredElectionResult.partyVotes[a][wa] ?? 0);
    });

    const presentParties = PARTY_CODES.filter(p =>
      codes.some(c => (filteredElectionResult.partyVotes[c][p] ?? 0) > 0),
    );

    const categories: CategoryShare[] = presentParties.map(p => ({
      code:         p,
      label:        p === 'ÖVRIGA' ? 'Övr.' : p,
      tooltipLabel: PARTY_LABELS[p] ?? p,
      color:        PARTY_COLORS[p] ?? '#ccc',
    }));

    const rows = sortedCodes.map(code => ({
      code,
      label:  filteredElectionResult.labels[code] ?? code,
      shares: filteredElectionResult.partyVotes[code],
    }));

    return { kind: 'categorical-share', categories, rows, label: filteredElectionResult.label, unit: filteredElectionResult.unit };
  }, [filteredElectionResult]);

  // Derived scalar values (geoCode → party share %) for the party choropleth map.
  const partyChoroplethValues = useMemo(() => {
    if (!electionResult || !activeParty) { return null; }
    return Object.fromEntries(
      Object.entries(electionResult.partyVotes).map(([code, votes]) => [code, votes[activeParty] ?? 0]),
    );
  }, [electionResult, activeParty]);

  // Tooltip strings: winner mode vs party mode.
  const tooltipData = useMemo(() => {
    if (!electionResult) { return null; }
    if (activeParty) {
      return Object.fromEntries(
        Object.entries(electionResult.partyVotes).map(([code, votes]) => {
          const share = votes[activeParty] ?? 0;
          return [code, `${PARTY_LABELS[activeParty] ?? activeParty} — ${share.toFixed(1)}%`];
        }),
      );
    }
    return Object.fromEntries(
      Object.entries(electionResult.winnerByGeo).map(([code, winner]) => {
        const share = electionResult.partyVotes[code]?.[winner] ?? 0;
        return [code, `${PARTY_LABELS[winner] ?? winner} — ${share.toFixed(1)}%`];
      }),
    );
  }, [electionResult, activeParty]);

  // Legend data: in party choropleth mode synthesise a scalar result so MapLegend
  // renders a gradient instead of party swatches.
  const legendData = useMemo(() => {
    if (activeParty && electionResult && partyChoroplethValues) {
      return {
        kind:   'scalar' as const,
        values: partyChoroplethValues,
        labels: electionResult.labels,
        label:  PARTY_LABELS[activeParty] ?? activeParty,
        unit:   '%',
      };
    }
    return datasetResult;
  }, [activeParty, electionResult, partyChoroplethValues, datasetResult]);

  // Areas ranked by selected party's share. Falls back to winner share.
  // Filtered by Lan at Municipality level.
  const partyRankingResult = useMemo(() => {
    if (!electionResult) { return null; }
    const filterByLan = activeChartType === 'party-ranking' && selectedLevel === 'Municipality' && effectiveLan;
    const values: Record<string, number> = {};
    for (const [code, votes] of Object.entries(electionResult.partyVotes)) {
      if (filterByLan && !code.startsWith(effectiveLan)) { continue; }
      values[code] = activeParty
        ? (votes[activeParty] ?? 0)
        : (votes[electionResult.winnerByGeo[code]] ?? 0);
    }
    const labels = filterByLan
      ? Object.fromEntries(Object.entries(electionResult.labels).filter(([c]) => c.startsWith(effectiveLan)))
      : electionResult.labels;
    return {
      kind:   'scalar' as const,
      values,
      labels,
      label:  activeParty ? (PARTY_LABELS[activeParty] ?? activeParty) : 'Vinnande parti',
      unit:   '%',
    };
  }, [electionResult, activeParty, activeChartType, selectedLevel, effectiveLan]);

  // In winner mode, color each ranking bar by the winning party.
  const rankingColorFn = useMemo(() => {
    if (activeParty || !electionResult) { return null; }
    return (code: string) => PARTY_COLORS[electionResult.winnerByGeo[code]] ?? '#ccc';
  }, [activeParty, electionResult]);

  const rankingRowMeta = useMemo(() => {
    if (activeParty || !electionResult) { return null; }
    return Object.fromEntries(
      Object.entries(electionResult.winnerByGeo).map(([code, winner]) => [
        code,
        PARTY_LABELS[winner] ?? winner,
      ]),
    );
  }, [activeParty, electionResult]);

  // Sub-boundary tooltip strings (winner or active-party mode).
  const subElectionTooltip = useMemo(() => {
    if (!subElectionResult) { return null; }
    if (activeParty) {
      return Object.fromEntries(
        Object.entries(subElectionResult.partyVotes).map(([code, votes]) => {
          const share = votes[activeParty] ?? 0;
          return [code, `${PARTY_LABELS[activeParty] ?? activeParty} — ${share.toFixed(1)}%`];
        }),
      );
    }
    return Object.fromEntries(
      Object.entries(subElectionResult.winnerByGeo).map(([code, winner]) => {
        const share = subElectionResult.partyVotes[code]?.[winner] ?? 0;
        return [code, `${PARTY_LABELS[winner] ?? winner} — ${share.toFixed(1)}%`];
      }),
    );
  }, [subElectionResult, activeParty]);

  // Color overrides for MultiLineChart: election party colors or descriptor lineColors.
  const partyColorOverrides = useMemo(() => {
    if (electionResult || activeDescriptor?.group === 'val') {
      return new Map(PARTY_CODES.map(p => [p, PARTY_COLORS[p]]));
    }
    if (activeDescriptor?.lineColors) {
      return new Map(Object.entries(activeDescriptor.lineColors));
    }
    return undefined;
  }, [electionResult, activeDescriptor]);

  return {
    partyShareData,
    partyChoroplethValues,
    tooltipData,
    legendData,
    partyRankingResult,
    rankingColorFn,
    rankingRowMeta,
    subElectionTooltip,
    partyColorOverrides,
  };
}
