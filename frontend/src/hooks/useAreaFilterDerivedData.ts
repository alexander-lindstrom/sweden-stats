import { useMemo } from 'react';
import type {
  AdminLevel, ChartType, DatasetDescriptor,
  ElectionDatasetResult, ScalarDatasetResult, SelectedFeature,
} from '@/datasets/types';
import { COUNTY_NAMES } from '@/datasets/adminLevels';

export interface AreaFilterDerivedData {
  // Diverging / election-bar / party-ranking filters
  needsLanFilter: boolean;
  needsMuniFilter: boolean;
  availableLans: Array<{ code: string; name: string }>;
  effectiveLan: string | null;
  availableMunis: Array<{ code: string; name: string }>;
  effectiveMuni: string | null;
  filteredForDiverging: ScalarDatasetResult | null;
  filteredElectionResult: ElectionDatasetResult | null;
  // Multiline election area filter
  needsMultilineAreaFilter: boolean;
  availableMultilineLans: Array<{ code: string; name: string }>;
  effectiveMultilineLan: string | null;
  availableMultilineMunis: Array<{ code: string; name: string }>;
  effectiveMultilineMuni: string | null;
  timeSeriesFeatureCode: string | null;
}

export interface AreaFilterDerivedDataOpts {
  selectedLevel: AdminLevel;
  activeChartType: ChartType;
  activeDescriptor: DatasetDescriptor | null;
  scalarResult: ScalarDatasetResult | null;
  electionResult: ElectionDatasetResult | null;
  selectedLan: string | null;
  selectedMuni: string | null;
  selectedFeature: SelectedFeature | null;
}

/**
 * Pure-derivation hook: computes all lan/municipality chart filtering from the
 * current navigation and dataset state. No state or effects — only useMemo.
 */
export function useAreaFilterDerivedData({
  selectedLevel,
  activeChartType,
  activeDescriptor,
  scalarResult,
  electionResult,
  selectedLan,
  selectedMuni,
  selectedFeature,
}: AreaFilterDerivedDataOpts): AreaFilterDerivedData {

  // ── Diverging / election-bar / party-ranking Lan+Muni filters ───────────

  const needsLanFilter = (
    (activeChartType === 'diverging' && (selectedLevel === 'Municipality' || selectedLevel === 'RegSO' || selectedLevel === 'DeSO'))
    || (activeChartType === 'election-bar' && selectedLevel === 'Municipality')
    || (activeChartType === 'party-ranking' && selectedLevel === 'Municipality')
  );

  const needsMuniFilter = activeChartType === 'diverging' &&
    (selectedLevel === 'RegSO' || selectedLevel === 'DeSO');

  const availableLans = useMemo(() => {
    if (!needsLanFilter) { return []; }
    const keys = scalarResult
      ? Object.keys(scalarResult.values)
      : electionResult
        ? Object.keys(electionResult.partyVotes)
        : [];
    const codes = new Set(keys.map(c => c.slice(0, 2)));
    return [...codes].sort().map(c => ({ code: c, name: COUNTY_NAMES[c] ?? c }));
  }, [scalarResult, electionResult, needsLanFilter]);

  const effectiveLan = useMemo(() => {
    if (availableLans.length === 0) { return null; }
    return availableLans.some(l => l.code === selectedLan) ? selectedLan : availableLans[0].code;
  }, [availableLans, selectedLan]);

  const availableMunis = useMemo(() => {
    if (!scalarResult?.parentLabels || !effectiveLan || !needsMuniFilter) { return []; }
    return Object.entries(scalarResult.parentLabels)
      .filter(([code]) => code.startsWith(effectiveLan))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => ({ code, name }));
  }, [scalarResult, effectiveLan, needsMuniFilter]);

  const effectiveMuni = useMemo(() => {
    if (availableMunis.length === 0) { return null; }
    return availableMunis.some(m => m.code === selectedMuni) ? selectedMuni : availableMunis[0].code;
  }, [availableMunis, selectedMuni]);

  const filteredForDiverging = useMemo(() => {
    if (!scalarResult) { return null; }
    if (!needsLanFilter || activeChartType !== 'diverging') { return scalarResult; }
    const filterCode = needsMuniFilter ? effectiveMuni : effectiveLan;
    if (!filterCode) { return null; }
    const values = Object.fromEntries(Object.entries(scalarResult.values).filter(([c]) => c.startsWith(filterCode)));
    const labels = Object.fromEntries(Object.entries(scalarResult.labels).filter(([c]) => c.startsWith(filterCode)));
    return { ...scalarResult, values, labels };
  }, [scalarResult, needsLanFilter, activeChartType, needsMuniFilter, effectiveLan, effectiveMuni]);

  const filteredElectionResult = useMemo(() => {
    if (!electionResult) { return null; }
    if (activeChartType !== 'election-bar' || selectedLevel !== 'Municipality' || !effectiveLan) {
      return electionResult;
    }
    const keep = ([c]: [string, unknown]) => c.startsWith(effectiveLan);
    return {
      ...electionResult,
      partyVotes:  Object.fromEntries(Object.entries(electionResult.partyVotes).filter(keep)),
      winnerByGeo: Object.fromEntries(Object.entries(electionResult.winnerByGeo).filter(keep)),
      labels:      Object.fromEntries(Object.entries(electionResult.labels).filter(keep)),
    };
  }, [electionResult, activeChartType, selectedLevel, effectiveLan]);

  // ── Multiline election area filter ──────────────────────────────────────

  const needsMultilineAreaFilter = activeChartType === 'multiline' && activeDescriptor?.group === 'val'
    && (selectedLevel === 'Region' || selectedLevel === 'Municipality');

  // Lan list: code-sorted, derived from COUNTY_NAMES (Region) or election data (Municipality).
  const availableMultilineLans = useMemo(() => {
    if (!needsMultilineAreaFilter) { return []; }
    if (selectedLevel === 'Region') {
      return Object.entries(COUNTY_NAMES).sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({ code, name }));
    }
    const codes = new Set(electionResult ? Object.keys(electionResult.partyVotes).map(c => c.slice(0, 2)) : []);
    return [...codes].sort().map(c => ({ code: c, name: COUNTY_NAMES[c] ?? c }));
  }, [needsMultilineAreaFilter, selectedLevel, electionResult]);

  // At Region level: effectiveLan is the selected feature code (a 2-char county code).
  // At Municipality level: effectiveLan comes from selectedLan state.
  const effectiveMultilineLan = useMemo(() => {
    if (availableMultilineLans.length === 0) { return null; }
    if (selectedLevel === 'Region') {
      const sf = selectedFeature?.code;
      return availableMultilineLans.some(l => l.code === sf) ? sf! : availableMultilineLans[0].code;
    }
    return availableMultilineLans.some(l => l.code === selectedLan) ? selectedLan! : availableMultilineLans[0].code;
  }, [availableMultilineLans, selectedLevel, selectedFeature, selectedLan]);

  // Municipality list for Municipality-level multiline: areas under the selected Lan.
  const availableMultilineMunis = useMemo(() => {
    if (!needsMultilineAreaFilter || selectedLevel !== 'Municipality' || !electionResult || !effectiveMultilineLan) { return []; }
    return Object.entries(electionResult.labels)
      .filter(([code]) => code.startsWith(effectiveMultilineLan))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => ({ code, name }));
  }, [needsMultilineAreaFilter, selectedLevel, electionResult, effectiveMultilineLan]);

  const effectiveMultilineMuni = useMemo(() => {
    if (availableMultilineMunis.length === 0) { return null; }
    const sf = selectedFeature?.code;
    return availableMultilineMunis.some(m => m.code === sf) ? sf! : availableMultilineMunis[0].code;
  }, [availableMultilineMunis, selectedFeature]);

  const timeSeriesFeatureCode = activeDescriptor?.group === 'val'
    ? (needsMultilineAreaFilter
        ? (selectedLevel === 'Municipality' ? effectiveMultilineMuni : effectiveMultilineLan)
        : (selectedFeature?.code ?? null))
    : null;

  return {
    needsLanFilter,
    needsMuniFilter,
    availableLans,
    effectiveLan,
    availableMunis,
    effectiveMuni,
    filteredForDiverging,
    filteredElectionResult,
    needsMultilineAreaFilter,
    availableMultilineLans,
    effectiveMultilineLan,
    availableMultilineMunis,
    effectiveMultilineMuni,
    timeSeriesFeatureCode,
  };
}
