import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from '@/components/map/MapView';
import { MapLegend } from '@/components/map/MapLegend';
import { MapSidebar } from '@/components/map/MapSidebar';
import { SelectionPanel } from '@/components/map/SelectionPanel';
import { RankedBarChart } from '@/components/visualizations/RankedBarChart';
import { Histogram } from '@/components/visualizations/Histogram';
import { DivergingBarChart } from '@/components/visualizations/DivergingBarChart';
import { SunburstWithBar } from '@/components/visualizations/SunburstWithBar';
import { MultiLineChart } from '@/components/visualizations/MultiLineChart';
import { DatasetTable } from '@/components/visualizations/DatasetTable';
import { ElectionTable } from '@/components/visualizations/ElectionTable';
import { PartyShareBarChart } from '@/components/visualizations/PartyShareBarChart';
import { ScatterPlot } from '@/components/visualizations/ScatterPlot';
import { BoxPlot } from '@/components/visualizations/BoxPlot';
import {
  AdminLevel, ChartType, ViewType, ScalarDatasetResult, FilterCriterion,
  viewsForLevel, chartTypesForLevel, CHART_TYPE_LABELS,
} from '@/datasets/types';
import { DATASETS, getDatasetsForLevel } from '@/datasets/registry';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { BaseMapKey } from '@/components/map/BaseMaps';
import { useDatasetFetch } from '@/hooks/useDatasetFetch';
import { useHierarchyFetch } from '@/hooks/useHierarchyFetch';
import { useTimeSeriesFetch } from '@/hooks/useTimeSeriesFetch';
import { useFilterMode } from '@/hooks/useFilterMode';
import { useMapKeyboardNavigation } from '@/hooks/useMapKeyboardNavigation';
import { TopLoadingBar } from '@/components/ui/TopLoadingBar';
import { Spinner } from '@/components/ui/Spinner';
import BivariateMapLegend from '@/components/map/BivariateMapLegend';
import { buildBivariateColorFn } from '@/util/bivariate';

// Sub-level for tooltip value lookup — when a feature is selected, fetch data
// one level down so hovering sub-boundaries can show their own values.
const SUB_LEVEL_FOR_FETCH: Partial<Record<AdminLevel, AdminLevel>> = {
  Region:       'Municipality',
  Municipality: 'RegSO',
};

// Feature property used for choropleth lookup — matches the direct boundary
// layer shown for each admin level.
const FEATURE_CODE_PROP: Record<AdminLevel, string> = {
  Country:      'sovereignt',
  Region:       'county_code',
  Municipality: 'municipality_code',
  RegSO:        'regsokod',
  DeSO:         'desokod',
};

const FEATURE_LABEL_PROP: Record<AdminLevel, string> = {
  Country:      'name',
  Region:       'county_name',
  Municipality: 'municipality_name',
  RegSO:        'regsonamn',
  DeSO:         'desokod',
};

// Property on sub-level features that holds the parent feature's code.
const FEATURE_PARENT_PROP: Partial<Record<AdminLevel, string>> = {
  RegSO: 'kommunkod',
  DeSO:  'regsokod',
};

const ALL_VIEWS: { key: ViewType; label: string }[] = [
  { key: 'map',   label: 'Karta'   },
  { key: 'chart', label: 'Diagram' },
  { key: 'table', label: 'Tabell'  },
];

export default function MapPage() {
  const [selectedLevel,     setSelectedLevel]     = useState<AdminLevel>('Region');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedYear,      setSelectedYear]       = useState<number>(2024);
  const [displayYear,       setDisplayYear]        = useState<number>(2024);
  const [activeView,        setActiveView]         = useState<ViewType>('map');
  const [activeChartType,   setActiveChartType]   = useState<ChartType>('bar');
  const [selectedBase,      setSelectedBase]       = useState<BaseMapKey>('None');
  const [selectedLan,       setSelectedLan]        = useState<string | null>(null);
  const [selectedMuni,      setSelectedMuni]       = useState<string | null>(null);
  const [selectedFeature,   setSelectedFeature]    = useState<{ code: string; label: string; parentCode?: string } | null>(null);
  const [comparisonFeature, setComparisonFeature]  = useState<{ code: string; label: string; parentCode?: string } | null>(null);
  const [selectionLevel,    setSelectionLevel]     = useState<AdminLevel>(selectedLevel);
  const [isPanelOpen,       setIsPanelOpen]        = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen]  = useState(false);
  const [mapResetToken,     setMapResetToken]       = useState(0);
  /** Which party to show on the choropleth map (null = winner coloring). */
  const [activeParty,       setActiveParty]        = useState<string | null>(null);
  /** Secondary dataset for the scatter chart Y axis. */
  const [scatterYDatasetId, setScatterYDatasetId]  = useState<string | null>(null);
  /** Whether bivariate choropleth mode is active. */
  const [bivariateMode,     setBivariateMode]       = useState(false);
  /** Secondary dataset for the bivariate Y axis. */
  const [bivariateYDatasetId, setBivariateYDatasetId] = useState<string | null>(null);
  /** Whether threshold filter mode is active. */
  const [filterEnabled,   setFilterEnabled]   = useState(false);
  const [filterCriteria,  setFilterCriteria]  = useState<FilterCriterion[]>([]);

  const yearDebounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<{ code: string; label: string; parentCode?: string } | null>(null);

  const { datasetResult, colorScale, mapColorFn, loading } = useDatasetFetch(
    selectedDatasetId, selectedLevel, selectedYear, activeParty,
  );

  const scalarResult   = datasetResult?.kind === 'scalar'   ? datasetResult as ScalarDatasetResult : null;
  const electionResult = datasetResult?.kind === 'election' ? datasetResult : null;

  // Sub-level fetch so hovering sub-boundaries shows their own values.
  const subLevel = SUB_LEVEL_FOR_FETCH[selectedLevel];
  const { datasetResult: subDatasetResult } = useDatasetFetch(
    selectedFeature && subLevel ? selectedDatasetId : null,
    subLevel ?? selectedLevel,
    selectedYear,
  );
  const subScalarResult    = subDatasetResult?.kind === 'scalar'   ? subDatasetResult as ScalarDatasetResult : null;
  const subElectionResult  = subDatasetResult?.kind === 'election' ? subDatasetResult : null;

  const { datasetResult: scatterYResult } = useDatasetFetch(
    scatterYDatasetId,
    selectedLevel,
    selectedYear,
  );
  const scatterYScalar = scatterYResult?.kind === 'scalar' ? scatterYResult as ScalarDatasetResult : null;

  const { datasetResult: bivariateYResult } = useDatasetFetch(
    bivariateMode ? bivariateYDatasetId : null,
    selectedLevel,
    selectedYear,
  );
  const bivariateYScalar = bivariateYResult?.kind === 'scalar' ? bivariateYResult as ScalarDatasetResult : null;

  const {
    matchingAreas,
    fetchedDatasets: filterFetchedDatasets,
    loading: filterLoading,
  } = useFilterMode(filterCriteria, selectedLevel, selectedYear, filterEnabled);
  const filterMatchingCount = matchingAreas?.size ?? null;

  const activeDescriptor = DATASETS.find((d) => d.id === selectedDatasetId) ?? null;
  const { data: hierarchyData,  loading: hierarchyLoading  } = useHierarchyFetch(activeDescriptor, activeChartType, selectedYear);

  // For election multiline at Region/Municipality level: allow picking a specific area via dropdowns.
  const needsMultilineAreaFilter = activeChartType === 'multiline' && activeDescriptor?.group === 'val'
    && (selectedLevel === 'Region' || selectedLevel === 'Municipality');

  // Lan list: code-sorted, derived from COUNTY_NAMES (Region) or from election data (Municipality).
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

  // Municipality list for Municipality-level multiline: areas under the selected Lan, code-sorted.
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
  const { data: timeSeriesData, loading: timeSeriesLoading } = useTimeSeriesFetch(
    activeDescriptor, activeChartType, selectedLevel, timeSeriesFeatureCode,
  );

  useMapKeyboardNavigation(
    selectedFeature, selectedLevel, scalarResult,
    setSelectedLevel, setSelectedFeature, pendingSelectionRef,
  );

  const handleComparisonSelect = (feature: { code: string; label: string; parentCode?: string } | null) => {
    if (!feature) { setComparisonFeature(null); return; }
    // Toggle off if the same area is shift-clicked again.
    if (feature.code === comparisonFeature?.code) { setComparisonFeature(null); return; }
    // Don't allow comparing an area with itself.
    if (feature.code === selectedFeature?.code) { return; }
    setComparisonFeature(feature);
  };

  const handleReset = () => {
    setSelectedLevel('Region');
    setSelectedFeature(null);
    setComparisonFeature(null);
    setActiveView('map');
    setIsPanelOpen(false);
    setMobileSidebarOpen(false);
    setActiveParty(null);
    setMapResetToken(t => t + 1);
  };

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) { clearTimeout(yearDebounceRef.current); }
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const handleFeatureSelect = (feature: { code: string; label: string; parentCode?: string } | null) => {
    setSelectedFeature(feature);
    // Regular click exits comparison mode — shift-click is the explicit comparison entry point.
    if (feature) { setComparisonFeature(null); }
  };

  const handleDrillDown = (level: AdminLevel, code: string, label: string, parentCode?: string) => {
    pendingSelectionRef.current = { code, label, parentCode };
    setSelectedLevel(level);
  };

  useEffect(() => {
    if (selectedFeature) { setIsPanelOpen(true); }
    else { setComparisonFeature(null); }
  }, [selectedFeature]);

  useEffect(() => {
    if (!selectedFeature) { return; }
    if (selectedLevel === 'Municipality' || selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      setSelectedLan(selectedFeature.code.slice(0, 2));
    }
    if (selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      setSelectedMuni(selectedFeature.code.slice(0, 4));
    }
  }, [selectedFeature, selectedLevel]);

  // When admin level changes, preserve dataset if still available; otherwise reset.
  useEffect(() => {
    const datasets = getDatasetsForLevel(selectedLevel);
    setSelectedDatasetId(id => datasets.some(d => d.id === id) ? id : (datasets[0]?.id ?? null));
    setSelectionLevel(selectedLevel);
    setComparisonFeature(null);
    setFilterCriteria([]);
    if (pendingSelectionRef.current) {
      setSelectedFeature(pendingSelectionRef.current);
      pendingSelectionRef.current = null;
    } else {
      setSelectedFeature(null);
    }
  }, [selectedLevel]);

  // When dataset changes: clamp year to available years, reset party filter if leaving elections.
  useEffect(() => {
    if (!selectedDatasetId) { return; }
    const descriptor = DATASETS.find(d => d.id === selectedDatasetId);
    if (!descriptor) { return; }

    if (descriptor.availableYears.length > 0 && !descriptor.availableYears.includes(selectedYear)) {
      const nearest = descriptor.availableYears.reduce((prev, curr) =>
        Math.abs(curr - selectedYear) < Math.abs(prev - selectedYear) ? curr : prev,
      );
      setSelectedYear(nearest);
      setDisplayYear(nearest);
    }

    if (descriptor.group !== 'val') {
      setActiveParty(null);
    }
  }, [selectedDatasetId, selectedYear]);

  const availableViews = useMemo(
    () => activeDescriptor ? viewsForLevel(activeDescriptor, selectedLevel) : ['map' as ViewType],
    [activeDescriptor, selectedLevel],
  );
  const availableChartTypes = useMemo(
    () => activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType],
    [activeDescriptor, selectedLevel],
  );

  useEffect(() => {
    if (!availableViews.includes(activeView)) {
      setActiveView(availableViews[0] ?? 'map');
    }
  }, [availableViews, activeView]);

  useEffect(() => {
    const types = activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType];
    setActiveChartType(ct => types.includes(ct) ? ct : (types[0] ?? 'bar'));
  }, [selectedLevel, activeDescriptor]);

  // ── Scatter Y-axis dataset ─────────────────────────────────────────────────
  // Scalar geographic datasets available as the Y axis (excludes active + elections).
  const scatterableDatasets = useMemo(
    () => DATASETS.filter(d =>
      d.id !== selectedDatasetId &&
      d.group !== 'val' &&
      d.supportedLevels.includes(selectedLevel) &&
      chartTypesForLevel(d, selectedLevel).some(ct => ['bar', 'diverging', 'histogram', 'scatter'].includes(ct)),
    ),
    [selectedDatasetId, selectedLevel],
  );

  // Auto-select the first available Y dataset when entering scatter mode or
  // when the active dataset / level changes while in scatter mode.
  useEffect(() => {
    if (activeChartType !== 'scatter') { return; }
    const valid = scatterableDatasets.some(d => d.id === scatterYDatasetId);
    if (!valid) {
      setScatterYDatasetId(scatterableDatasets[0]?.id ?? null);
    }
  }, [activeChartType, scatterableDatasets, scatterYDatasetId]);

  // ── Bivariate choropleth ───────────────────────────────────────────────────
  // Scalar datasets available as the bivariate Y axis (excludes active dataset + elections).
  const bivariateDatasets = useMemo(
    () => DATASETS.filter(d =>
      d.id !== selectedDatasetId &&
      d.group !== 'val' &&
      d.supportedLevels.includes(selectedLevel),
    ),
    [selectedDatasetId, selectedLevel],
  );

  // Deactivate bivariate mode when leaving map view or switching to an election dataset.
  useEffect(() => {
    if (activeView !== 'map') { setBivariateMode(false); }
  }, [activeView]);

  useEffect(() => {
    if (activeDescriptor?.group === 'val') {
      setBivariateMode(false);
      setFilterEnabled(false);
      setFilterCriteria([]);
    }
  }, [activeDescriptor]);

  // Auto-select a Y dataset when entering bivariate mode or when available datasets change.
  useEffect(() => {
    if (!bivariateMode) { return; }
    const valid = bivariateDatasets.some(d => d.id === bivariateYDatasetId);
    if (!valid) {
      setBivariateYDatasetId(bivariateDatasets[0]?.id ?? null);
    }
  }, [bivariateMode, bivariateDatasets, bivariateYDatasetId]);

  const bivariateYDescriptor = useMemo(
    () => DATASETS.find(d => d.id === bivariateYDatasetId) ?? null,
    [bivariateYDatasetId],
  );

  // Color function for bivariate mode: maps (code) → 3×3 palette hex.
  const bivariateFn = useMemo(() => {
    if (!bivariateMode || !scalarResult || !bivariateYScalar) { return null; }
    return buildBivariateColorFn(scalarResult.values, bivariateYScalar.values);
  }, [bivariateMode, scalarResult, bivariateYScalar]);

  // ── Lan/Municipality filter ────────────────────────────────────────────────
  // Applied for: diverging chart at sub-county levels, election-bar at municipality level.
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

  // Election chart: filter to selected Lan at municipality level.
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

  // ── Party choropleth ───────────────────────────────────────────────────────
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

  // Legend data: when in party choropleth mode, synthesise a scalar-like result
  // so MapLegend renders a gradient instead of party swatches.
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

  // Derived scalar result for party-ranking chart: areas ranked by selected party's share.
  // Falls back to winner share when no party is selected. Filtered by Lan at Municipality level.
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

  // In winner mode, color each ranking bar by the winning party and show its name in the tooltip.
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

  // Sub-boundary tooltip strings for election datasets (winner or active-party mode).
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

  // Color overrides for MultiLineChart when showing election time series.
  const partyColorOverrides = useMemo(
    () => electionResult || activeDescriptor?.group === 'val'
      ? new Map(PARTY_CODES.map(p => [p, PARTY_COLORS[p]]))
      : undefined,
    [electionResult, activeDescriptor],
  );

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <TopLoadingBar loading={loading || hierarchyLoading || timeSeriesLoading} />

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-20 bg-black/30"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <MapSidebar
        selectedLevel={selectedLevel}
        onLevelChange={(l) => { setSelectedLevel(l); setMobileSidebarOpen(false); }}
        selectedDatasetId={selectedDatasetId}
        onDatasetChange={(id) => { setSelectedDatasetId(id); setMobileSidebarOpen(false); }}
        activeDescriptor={activeDescriptor}
        displayYear={displayYear}
        onYearChange={handleYearChange}
        selectedBase={selectedBase}
        onBaseChange={setSelectedBase}
        onReset={handleReset}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        filterEnabled={filterEnabled}
        onFilterEnabledChange={setFilterEnabled}
        filterCriteria={filterCriteria}
        onFilterCriteriaChange={setFilterCriteria}
        filterFetchedDatasets={filterFetchedDatasets}
        filterMatchingCount={filterMatchingCount}
        filterLoading={filterLoading}
      />

      {/* ── Centre panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* View toggle bar */}
        <div className="flex items-center border-b border-slate-200 px-4 bg-white flex-shrink-0">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileSidebarOpen(o => !o)}
            aria-label="Öppna meny"
            className="sm:hidden mr-2 p-1 -ml-1 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {ALL_VIEWS.map(({ key, label }) => {
            const supported = availableViews.includes(key);
            return (
              <button
                key={key}
                onClick={() => { if (supported) { setActiveView(key); } }}
                disabled={!supported}
                className={[
                  'px-4 py-3 text-sm font-medium transition-colors -mb-px border-b-2',
                  !supported
                    ? 'text-slate-300 border-transparent cursor-not-allowed'
                    : activeView === key
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-500 border-transparent hover:text-slate-800 hover:border-slate-300',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}

          {activeDescriptor && (
            <span className="ml-auto text-xs text-slate-400">
              {activeDescriptor.label} · {activeDescriptor.source} · {selectedYear}
            </span>
          )}

          {/* Party selector — shown when an election dataset is active in map view
              or in chart view for the party-ranking chart type */}
          {electionResult && (activeView === 'map' || activeChartType === 'party-ranking') && (
            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-200">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Parti</span>
              <div className="relative">
                <select
                  value={activeParty ?? ''}
                  onChange={e => setActiveParty(e.target.value || null)}
                  className="appearance-none text-xs border border-slate-200 rounded px-2.5 py-1 pr-6 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">Vinnare</option>
                  {PARTY_CODES.map(p => (
                    <option key={p} value={p}>{PARTY_LABELS[p] ?? p}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 text-slate-400">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}
          {/* Bivariate toggle — only for non-election scalar datasets in map view */}
          {activeView === 'map' && scalarResult && !electionResult && (
            <div className="flex items-center ml-3 pl-3 border-l border-slate-200">
              <button
                onClick={() => setBivariateMode(m => !m)}
                title={bivariateMode ? 'Stäng 2D-läge' : 'Visa två variabler på kartan (bivariat)'}
                className={[
                  'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border',
                  bivariateMode
                    ? 'bg-violet-50 border-violet-200 text-violet-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                ].join(' ')}
              >
                2D
              </button>
            </div>
          )}

          <button
            onClick={() => setIsPanelOpen(p => !p)}
            title={isPanelOpen ? 'Dölj panel' : 'Visa panel'}
            className={[
              'ml-3 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border',
              isPanelOpen
                ? 'bg-blue-50 border-blue-100 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            ].join(' ')}
          >
            {isPanelOpen ? '▶ Dölj' : '◀ Detaljer'}
          </button>
        </div>

        {/* Main view area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Chart type sub-selector */}
          {activeView === 'chart' && availableChartTypes.length > 1 && (
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
              {availableChartTypes.map(ct => (
                <button
                  key={ct}
                  onClick={() => setActiveChartType(ct)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    activeChartType === ct
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                  ].join(' ')}
                >
                  {CHART_TYPE_LABELS[ct]}
                </button>
              ))}
            </div>
          )}

          {/* Area selector for multiline election time series at Region/Municipality level */}
          {activeView === 'chart' && needsMultilineAreaFilter && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Län</label>
              <select
                value={effectiveMultilineLan ?? ''}
                onChange={e => {
                  const code = e.target.value;
                  if (selectedLevel === 'Region') {
                    setSelectedFeature({ code, label: COUNTY_NAMES[code] ?? code });
                  } else {
                    setSelectedLan(code);
                  }
                }}
                className="text-sm border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableMultilineLans.map(({ code, name }) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              {selectedLevel === 'Municipality' && (
                <>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ml-2">Kommun</label>
                  <select
                    value={effectiveMultilineMuni ?? ''}
                    onChange={e => {
                      const code = e.target.value;
                      const name = electionResult?.labels[code] ?? code;
                      setSelectedFeature({ code, label: name });
                    }}
                    className="text-sm border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableMultilineMunis.map(({ code, name }) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          {/* Lan / Municipality filter */}
          {activeView === 'chart' && needsLanFilter && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Län</label>
              <select
                value={effectiveLan ?? ''}
                onChange={e => setSelectedLan(e.target.value || null)}
                className="text-sm border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableLans.map(({ code, name }) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              {needsMuniFilter && (
                <>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ml-2">Kommun</label>
                  <select
                    value={effectiveMuni ?? ''}
                    onChange={e => setSelectedMuni(e.target.value || null)}
                    className="text-sm border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableMunis.map(({ code, name }) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          {/* Y-axis dataset selector for bivariate map */}
          {activeView === 'map' && bivariateMode && bivariateDatasets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-violet-50/60 flex-shrink-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-violet-500 whitespace-nowrap">Y-axel</label>
              <select
                value={bivariateYDatasetId ?? ''}
                onChange={e => setBivariateYDatasetId(e.target.value || null)}
                className="text-sm border border-violet-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {bivariateDatasets.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Y-axis dataset selector for scatter chart */}
          {activeView === 'chart' && activeChartType === 'scatter' && scatterableDatasets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Y-axel</label>
              <select
                value={scatterYDatasetId ?? ''}
                onChange={e => setScatterYDatasetId(e.target.value || null)}
                className="text-sm border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {scatterableDatasets.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="flex-1 relative overflow-hidden min-w-0" style={{ isolation: 'isolate' }}>
              {activeView === 'map' && (
                <MapView
                  adminLevel={selectedLevel}
                  selectedBase={selectedBase}
                  choroplethData={partyChoroplethValues ?? scalarResult?.values ?? null}
                  colorScale={bivariateFn ? null : colorScale}
                  mapColorFn={bivariateFn ?? mapColorFn}
                  tooltipData={tooltipData}
                  featureLabels={datasetResult?.labels}
                  featureCodeProperty={FEATURE_CODE_PROP[selectedLevel]}
                  featureLabelProperty={FEATURE_LABEL_PROP[selectedLevel]}
                  featureParentProperty={FEATURE_PARENT_PROP[selectedLevel]}
                  unit={activeParty ? '%' : (datasetResult?.unit ?? '')}
                  subChoroplethData={subScalarResult?.values ?? null}
                  subTooltipData={subElectionTooltip}
                  resetToken={mapResetToken}
                  selectedFeature={selectedFeature}
                  onFeatureSelect={handleFeatureSelect}
                  onDrillDown={handleDrillDown}
                  comparisonFeature={comparisonFeature}
                  onComparisonSelect={handleComparisonSelect}
                  matchingAreas={matchingAreas}
                />
              )}
              {activeView === 'map' && bivariateFn && activeDescriptor && bivariateYDescriptor && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 pointer-events-none">
                  <BivariateMapLegend
                    xLabel={`${activeDescriptor.label}${scalarResult?.unit ? ` (${scalarResult.unit})` : ''}`}
                    yLabel={`${bivariateYDescriptor.label}${bivariateYScalar?.unit ? ` (${bivariateYScalar.unit})` : ''}`}
                  />
                </div>
              )}
              {activeView === 'map' && !bivariateFn && legendData && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 pointer-events-none">
                  <MapLegend data={legendData} scale={colorScale} />
                </div>
              )}

              {activeView === 'chart' && activeChartType === 'bar' && scalarResult && (
                <div className="w-full h-full p-6">
                  <RankedBarChart data={scalarResult} colorScale={colorScale} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} comparisonFeature={comparisonFeature} onComparisonSelect={handleComparisonSelect} matchingAreas={matchingAreas} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'histogram' && scalarResult && (
                <div className="w-full h-full p-6">
                  <Histogram data={scalarResult} colorScale={colorScale} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'diverging' && filteredForDiverging && (
                <div className="w-full h-full p-6">
                  <DivergingBarChart data={filteredForDiverging} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'election-bar' && filteredElectionResult && (
                <div className="w-full h-full p-6">
                  <PartyShareBarChart
                    data={filteredElectionResult}
                    selectedFeature={selectedFeature}
                    onFeatureSelect={handleFeatureSelect}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'sunburst' && hierarchyData && (
                <div className="w-full h-full p-4">
                  <SunburstWithBar
                    root={hierarchyData}
                    unit={datasetResult?.unit ?? ''}
                    label={activeDescriptor?.label ?? ''}
                    onFeatureSelect={activeDescriptor?.sunburstDepthToLevel ? handleFeatureSelect : undefined}
                    depthToLevel={activeDescriptor?.sunburstDepthToLevel}
                    onSelectionLevelChange={activeDescriptor?.sunburstDepthToLevel ? setSelectionLevel : undefined}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'sunburst' && !hierarchyData && hierarchyLoading && (
                <Spinner />
              )}
              {activeView === 'chart' && activeChartType === 'multiline' && timeSeriesData && (
                <div className="w-full h-full p-4">
                  <MultiLineChart
                    data={timeSeriesData}
                    label={timeSeriesFeatureCode
                      ? (COUNTY_NAMES[timeSeriesFeatureCode] ?? electionResult?.labels[timeSeriesFeatureCode] ?? selectedFeature?.label ?? activeDescriptor?.label)
                      : activeDescriptor?.label}
                    colorOverrides={partyColorOverrides}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'party-ranking' && partyRankingResult && (
                <div className="w-full h-full p-6">
                  <RankedBarChart
                    data={partyRankingResult}
                    colorScale={activeParty ? colorScale : null}
                    colorFn={rankingColorFn}
                    rowMeta={rankingRowMeta}
                    selectedFeature={selectedFeature}
                    onFeatureSelect={handleFeatureSelect}
                    comparisonFeature={comparisonFeature}
                    onComparisonSelect={handleComparisonSelect}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'scatter' && scalarResult && scatterYScalar && (
                <div className="w-full h-full p-4">
                  <ScatterPlot
                    xData={scalarResult}
                    yData={scatterYScalar}
                    selectedFeature={selectedFeature}
                    onFeatureSelect={handleFeatureSelect}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'boxplot' && scalarResult && (
                <div className="w-full h-full p-6 overflow-y-auto">
                  <BoxPlot
                    data={scalarResult}
                    colorScale={colorScale}
                    selectedFeature={selectedFeature}
                    onFeatureSelect={handleFeatureSelect}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'multiline' && !timeSeriesData && timeSeriesLoading && (
                <Spinner />
              )}
              {activeView === 'chart' && activeChartType !== 'sunburst' && activeChartType !== 'diverging' && activeChartType !== 'multiline' && activeChartType !== 'election-bar' && activeChartType !== 'party-ranking' && activeChartType !== 'scatter' && activeChartType !== 'boxplot' && !datasetResult && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Välj ett dataset för att visa diagram.
                </div>
              )}

              {activeView === 'table' && scalarResult && (
                <div className="w-full h-full p-6">
                  <DatasetTable data={scalarResult} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} comparisonFeature={comparisonFeature} onComparisonSelect={handleComparisonSelect} matchingAreas={matchingAreas} />
                </div>
              )}
              {activeView === 'table' && electionResult && (
                <div className="w-full h-full p-6">
                  <ElectionTable data={electionResult} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} />
                </div>
              )}
              {activeView === 'table' && !datasetResult && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Välj ett dataset för att visa tabell.
                </div>
              )}
            </div>

            <SelectionPanel
              selectedFeature={selectedFeature}
              adminLevel={selectionLevel}
              isOpen={isPanelOpen}
              onClose={() => setIsPanelOpen(false)}
              comparisonFeature={comparisonFeature}
              onClearComparison={() => setComparisonFeature(null)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
