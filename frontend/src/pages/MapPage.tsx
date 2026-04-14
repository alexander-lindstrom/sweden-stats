import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeatureProfile } from '@/components/profile/FeatureProfile';
import { MapLegend } from '@/components/map/MapLegend';
import { MapSidebar } from '@/components/map/MapSidebar';
import { KoladaBrowsePanel } from '@/components/map/KoladaBrowsePanel';
import { FilterBrowsePanel } from '@/components/map/FilterBrowsePanel';
import { usePinnedKolada } from '@/hooks/usePinnedKolada';
import { SelectionPanel } from '@/components/map/SelectionPanel';
import { DatasetTable } from '@/components/visualizations/DatasetTable';
import { ElectionTable } from '@/components/visualizations/ElectionTable';

const MapView        = lazy(() => import('@/components/map/MapView'));
const RankedBarChart = lazy(() => import('@/components/visualizations/RankedBarChart').then(m => ({ default: m.RankedBarChart })));
const Histogram      = lazy(() => import('@/components/visualizations/Histogram').then(m => ({ default: m.Histogram })));
const DivergingBarChart = lazy(() => import('@/components/visualizations/DivergingBarChart').then(m => ({ default: m.DivergingBarChart })));
const SunburstWithBar = lazy(() => import('@/components/visualizations/SunburstWithBar').then(m => ({ default: m.SunburstWithBar })));
const MultiLineChart = lazy(() => import('@/components/visualizations/MultiLineChart').then(m => ({ default: m.MultiLineChart })));
const ShareBarChart  = lazy(() => import('@/components/visualizations/ShareBarChart').then(m => ({ default: m.ShareBarChart })));
const DonutChart     = lazy(() => import('@/components/visualizations/DonutChart').then(m => ({ default: m.DonutChart })));
const ScatterPlot    = lazy(() => import('@/components/visualizations/ScatterPlot').then(m => ({ default: m.ScatterPlot })));
const BoxPlot        = lazy(() => import('@/components/visualizations/BoxPlot').then(m => ({ default: m.BoxPlot })));
import { FeatureSearch } from '@/components/ui/FeatureSearch';
import {
  AdminLevel, ViewType, ScalarDatasetResult, FilterCriterion,
  CHART_TYPE_LABELS,
  type SelectedFeature,
} from '@/datasets/types';
import { DATASETS } from '@/datasets/registry';
import { preload } from '@/datasets/cache';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { PARTY_CODES, PARTY_LABELS } from '@/datasets/parties';
import { BaseMapKey } from '@/components/map/BaseMaps';
import { useDatasetFetch } from '@/hooks/useDatasetFetch';
import { useHierarchyFetch } from '@/hooks/useHierarchyFetch';
import { useTimeSeriesFetch } from '@/hooks/useTimeSeriesFetch';
import { useFilterMode } from '@/hooks/useFilterMode';
import { useMapKeyboardNavigation } from '@/hooks/useMapKeyboardNavigation';
import { useNavigationState } from '@/hooks/useNavigationState';
import { useDatasetState } from '@/hooks/useDatasetState';
import { useViewState } from '@/hooks/useViewState';
import { useUrlState } from '@/hooks/useUrlState';
import { useAreaFilterDerivedData } from '@/hooks/useAreaFilterDerivedData';
import { useElectionDerivedData } from '@/hooks/useElectionDerivedData';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { TopLoadingBar } from '@/components/ui/TopLoadingBar';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import { SectionLabel } from '@/components/ui/SectionLabel';
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
  { key: 'map',     label: 'Karta'   },
  { key: 'chart',   label: 'Diagram' },
  { key: 'table',   label: 'Tabell'  },
  { key: 'profile', label: 'Profil'  },
];

export default function MapPage() {
  // ── URL state (parsed once on mount; drives initial values below) ──────
  const { initialValues, syncUrl } = useUrlState();

  // Tracks the last admin level the level-change effect ran for.
  // null = never ran (initial mount). Comparing against selectedLevel lets us
  // skip Strict Mode's double-invocation (same level as previous run) while
  // still firing when the user actually changes level (different level).
  const lastProcessedLevelRef = useRef<AdminLevel | null>(null);

  // ── Pinned Kolada KPIs ─────────────────────────────────────────────────
  const pinnedKolada = usePinnedKolada();
  // Merge once so every hook receives the same stable reference.
  const allDatasets = useMemo(
    () => pinnedKolada.descriptors.length > 0 ? [...DATASETS, ...pinnedKolada.descriptors] : DATASETS,
    [pinnedKolada.descriptors],
  );

  // ── UI layout state ────────────────────────────────────────────────────
  const [isPanelOpen,         setIsPanelOpen]         = useState(!!initialValues.selectedFeature);
  const [desktopSidebarOpen,  setDesktopSidebarOpen]  = useState(true);
  const [mobileSidebarOpen,   setMobileSidebarOpen]   = useState(false);
  const [koladaBrowseOpen,    setKoladaBrowseOpen]    = useState(false);
  const [filterPanelOpen,     setFilterPanelOpen]     = useState(false);
  const [mapResetToken,       setMapResetToken]       = useState(0);
  const [selectedBase,        setSelectedBase]        = useState<BaseMapKey>('None');
  const [fillOpacity,         setFillOpacity]         = useState(1.0);

  // ── Filter state ───────────────────────────────────────────────────────
  /** Whether threshold filter mode is active. */
  const [filterEnabled,   setFilterEnabled]   = useState(false);
  const [filterCriteria,  setFilterCriteria]  = useState<FilterCriterion[]>([]);

  // ── Navigation (geo cursor) ────────────────────────────────────────────
  const onSelectionChange = useCallback((feature: SelectedFeature | null, dismissed: boolean) => {
    if (feature && !dismissed) { setIsPanelOpen(true); }
  }, []);

  const nav = useNavigationState(onSelectionChange, {
    selectedLevel:     initialValues.selectedLevel     ?? undefined,
    selectedFeature:   initialValues.selectedFeature   ?? undefined,
    comparisonFeature: initialValues.comparisonFeature ?? undefined,
  });
  const {
    selectedLevel, setSelectedLevel,
    selectedFeature, setSelectedFeature,
    selectionLevel, setSelectionLevel,
    comparisonFeature, setComparisonFeature,
    drillStack, setDrillStack,
    selectedLan, setSelectedLan,
    selectedMuni, setSelectedMuni,
    munLabels,
    pendingSelectionRef,
    userDismissedPanel,
    breadcrumbAncestors,
    handleFeatureSelect,
    handleComparisonSelect,
    handleDrillDown,
    handleBreadcrumbGoto,
  } = nav;

  // ── Dataset (year, party, descriptor) ─────────────────────────────────
  const ds = useDatasetState(
    {
      selectedDatasetId: initialValues.selectedDatasetId ?? undefined,
      selectedYear:      initialValues.selectedYear      ?? undefined,
      activeParty:       initialValues.activeParty       ?? undefined,
    },
    allDatasets,
  );
  const {
    selectedDatasetId, setSelectedDatasetId,
    selectedYear,
    displayYear,
    handleYearChange,
    activeParty, setActiveParty,
    activeDescriptor,
    resetDatasetForLevel,
  } = ds;

  // ── View / chart type / bivariate / scatter ────────────────────────────
  const onElectionDataset = useCallback(() => {
    setFilterEnabled(false);
    setFilterCriteria([]);
  }, []);

  const view = useViewState(
    selectedLevel,
    selectedDatasetId,
    activeDescriptor,
    onElectionDataset,
    {
      activeView:      initialValues.activeView      ?? undefined,
      activeChartType: initialValues.activeChartType ?? undefined,
    },
    allDatasets,
  );
  const {
    activeView, setActiveView,
    activeChartType, setActiveChartType,
    availableViews, availableChartTypes,
    bivariateMode, setBivariateMode,
    bivariateYDatasetId, setBivariateYDatasetId,
    bivariateDatasets, bivariateYDescriptor,
    scatterYDatasetId, setScatterYDatasetId,
    scatterableDatasets,
  } = view;

  const { datasetResult, colorScale, mapColorFn, loading } = useDatasetFetch(
    selectedDatasetId, selectedLevel, selectedYear, activeParty, allDatasets,
  );

  const scalarResult        = datasetResult?.kind === 'scalar'            ? datasetResult as ScalarDatasetResult : null;
  const electionResult      = datasetResult?.kind === 'election'          ? datasetResult : null;
  const categoricalResult   = datasetResult?.kind === 'categorical-share' ? datasetResult : null;
  const donutResult         = datasetResult?.kind === 'donut'             ? datasetResult : null;
  const resultLabels        = scalarResult?.labels ?? electionResult?.labels;

  // Sub-level fetch so hovering sub-boundaries shows their own values.
  // Pass allDatasets only when the active descriptor explicitly supports the sub-level —
  // this lets pinned Kolada KPIs with municipality_type='A' show municipality values
  // when the user is at Region level, while preventing spurious fetches at lower levels
  // where Kolada has no sub-boundary (RegSO/DeSO) data.
  const subLevel = SUB_LEVEL_FOR_FETCH[selectedLevel];
  const subLevelDatasets = subLevel && activeDescriptor?.supportedLevels.includes(subLevel)
    ? allDatasets
    : undefined;
  const { datasetResult: subDatasetResult } = useDatasetFetch(
    selectedFeature && subLevel ? selectedDatasetId : null,
    subLevel ?? selectedLevel,
    selectedYear,
    undefined,
    subLevelDatasets,
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
    sortedValues: filterSortedValues,
    loading: filterLoading,
  } = useFilterMode(filterCriteria, selectedLevel, selectedYear, filterEnabled);
  const filterMatchingCount = matchingAreas?.size ?? null;

  // Warm the cache for all filterable datasets at the current level so the
  // filter panel feels instant when the user opens it.
  useEffect(() => {
    const filterable = DATASETS.filter(
      d => d.group !== 'val' && d.supportedLevels.includes(selectedLevel),
    );
    for (const descriptor of filterable) {
      preload(descriptor, [selectedLevel], selectedYear);
    }
  }, [selectedLevel, selectedYear]);

  const { data: hierarchyData,  loading: hierarchyLoading  } = useHierarchyFetch(activeDescriptor, activeChartType, selectedYear);

  const searchItems = useMemo(() => {
    if (selectionLevel === selectedLevel || !hierarchyData || !activeDescriptor?.sunburstDepthToLevel) {
      return Object.entries(resultLabels ?? {}).map(([code, label]) => ({ code, label: stripLanSuffix(label) }));
    }
    // Sunburst drill mode — extract labels from the hierarchy at the target depth.
    const targetDepth = activeDescriptor.sunburstDepthToLevel.indexOf(selectionLevel);
    if (targetDepth < 0) { return []; }
    const items: { code: string; label: string }[] = [];
    const collect = (node: typeof hierarchyData, depth: number) => {
      if (depth === targetDepth) { items.push({ code: node.code, label: stripLanSuffix(node.name) }); return; }
      node.children?.forEach(c => collect(c, depth + 1));
    };
    collect(hierarchyData, 0);
    return items;
  }, [selectionLevel, selectedLevel, resultLabels, hierarchyData, activeDescriptor]);

  // ── Area filter + election derived data ──────────────────────────────────
  const areaFilter = useAreaFilterDerivedData({
    selectedLevel, activeChartType, activeDescriptor,
    scalarResult, electionResult,
    selectedLan, selectedMuni, selectedFeature,
  });
  const {
    needsLanFilter, needsMuniFilter,
    availableLans, effectiveLan,
    availableMunis, effectiveMuni,
    filteredForDiverging, filteredElectionResult,
    needsMultilineAreaFilter,
    availableMultilineLans, effectiveMultilineLan,
    availableMultilineMunis, effectiveMultilineMuni,
    timeSeriesFeatureCode,
  } = areaFilter;

  const { data: timeSeriesData, loading: timeSeriesLoading } = useTimeSeriesFetch(
    activeDescriptor, activeChartType, selectedLevel, timeSeriesFeatureCode,
  );

  const election = useElectionDerivedData({
    electionResult, filteredElectionResult, subElectionResult,
    activeParty, activeChartType, selectedLevel, effectiveLan,
    activeDescriptor, datasetResult,
  });
  const {
    partyShareData, partyChoroplethValues, tooltipData, legendData,
    partyRankingResult, rankingColorFn, rankingRowMeta,
    subElectionTooltip, partyColorOverrides,
  } = election;

  useMapKeyboardNavigation(
    selectedFeature, selectedLevel, scalarResult,
    setSelectedLevel, setSelectedFeature, pendingSelectionRef,
    drillStack, setDrillStack,
  );

  const handleReset = () => {
    setDrillStack([]);
    setSelectedLevel('Region');
    setSelectedFeature(null);
    setComparisonFeature(null);
    resetDatasetForLevel('Region');
    setActiveView('map');
    setActiveChartType('bar');
    setFilterEnabled(false);
    setFilterCriteria([]);
    userDismissedPanel.current = false;
    setIsPanelOpen(false);
    setMobileSidebarOpen(false);
    setActiveParty(null);
    setMapResetToken(t => t + 1);
  };

  // When admin level changes: reset dataset if unavailable, clear comparison/filters/selection.
  // lastProcessedLevelRef tracks the last level this effect ran for:
  //   - null  → initial mount: run dataset/level sync but skip state clearing to preserve URL state
  //   - same  → Strict Mode re-invocation with no real level change, skip entirely
  //   - diff  → user changed the level, run everything
  useEffect(() => {
    const prev = lastProcessedLevelRef.current;
    lastProcessedLevelRef.current = selectedLevel;
    if (prev === selectedLevel) { return; }

    // Always run on mount and on level change: ensures a valid default dataset is set
    // (no-op if the URL-provided dataset is already valid for this level).
    resetDatasetForLevel(selectedLevel);
    setSelectionLevel(selectedLevel);

    // Skip state clearing on initial mount to preserve URL-initialized state.
    if (prev === null) { return; }

    setComparisonFeature(null);
    setFilterCriteria([]);
    if (pendingSelectionRef.current) {
      setSelectedFeature(pendingSelectionRef.current);
      pendingSelectionRef.current = null;
    } else {
      setSelectedFeature(null);
    }
  }, [selectedLevel, resetDatasetForLevel, pendingSelectionRef, setComparisonFeature, setSelectedFeature, setSelectionLevel]);

  // Sync settled state → URL after every relevant state change.
  useEffect(() => {
    syncUrl({
      selectedLevel, selectedFeature, comparisonFeature,
      selectedDatasetId, selectedYear, activeParty,
      activeView, activeChartType,
    });
  }, [
    syncUrl,
    selectedLevel, selectedFeature, comparisonFeature,
    selectedDatasetId, selectedYear, activeParty,
    activeView, activeChartType,
  ]);

  // Color function for bivariate mode: maps (code) → 3×3 palette hex.
  const bivariateFn = useMemo(() => {
    if (!bivariateMode || !scalarResult || !bivariateYScalar) { return null; }
    return buildBivariateColorFn(scalarResult.values, bivariateYScalar.values);
  }, [bivariateMode, scalarResult, bivariateYScalar]);

  // ── Profile search items ──────────────────────────────────────────────────
  // Reuses searchItems; falls back to munLabels so the profile search is always populated.
  const profileSearchItems = useMemo(() => {
    if (activeView !== 'profile') { return []; }
    if (searchItems.length > 0) { return searchItems; }
    if (selectedLevel === 'Region') {
      return Object.entries(COUNTY_NAMES)
        .map(([code, label]) => ({ code, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'sv'));
    }
    if (selectedLevel === 'Municipality' && munLabels) {
      return Object.entries(munLabels)
        .map(([code, label]) => ({ code, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'sv'));
    }
    return [];
  }, [activeView, selectedLevel, searchItems, munLabels]);

  // Content-sized charts should shrink the render area to content height instead of filling.
  // Fill charts (sunburst, multiline, scatter) and the map still need the full-height flex container.
  // Charts whose SVG height is data-driven (not container-driven) get a content-sized render area —
  // the bg-slate-50 card shrinks to content height and bg-white shows below as a clean terminus.
  // Only add a chart type here once it has been refactored to be truly content-sized.
  const isContentSized = activeView === 'profile' || (activeView === 'chart' && (
    activeChartType === 'diverging' ||
    activeChartType === 'bar' ||
    activeChartType === 'party-ranking' ||
    activeChartType === 'boxplot' ||
    activeChartType === 'election-bar' ||
    activeChartType === 'donut'
  ));

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <TopLoadingBar loading={loading || hierarchyLoading || timeSeriesLoading} />

      {/* Sidebar backdrop — visible below lg where sidebar is an overlay */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed top-11 inset-x-0 bottom-0 z-20 bg-black/30"
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
        desktopOpen={desktopSidebarOpen}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        filterEnabled={filterEnabled}
        filterCriteria={filterCriteria}
        fillOpacity={fillOpacity}
        onFillOpacityChange={setFillOpacity}
        extraDatasets={pinnedKolada.descriptors}
        onOpenKoladaBrowse={() => setKoladaBrowseOpen(true)}
        onOpenFilterPanel={() => setFilterPanelOpen(true)}
      />

      {/* ── Centre panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* View toggle bar */}
        <div className="flex items-stretch h-11 border-b border-slate-200 px-3 bg-white flex-shrink-0">
          {/* Hamburger — below md only */}
          <button
            onClick={() => setMobileSidebarOpen(o => !o)}
            aria-label="Öppna meny"
            className="md:hidden flex items-center justify-center w-8 mr-1 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Sidebar toggle — md+ only */}
          <button
            onClick={() => setDesktopSidebarOpen(o => !o)}
            title={desktopSidebarOpen ? 'Dölj sidopanel' : 'Visa sidopanel'}
            className={[
              'hidden md:flex self-center mr-2 items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
              desktopSidebarOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            ].join(' ')}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
              <line x1="5.5" y1="1.5" x2="5.5" y2="14.5" />
            </svg>
            <span className="hidden lg:inline">{desktopSidebarOpen ? 'Dölj' : 'Meny'}</span>
          </button>

          {/* View tabs */}
          {ALL_VIEWS.map(({ key, label }, index) => {
            const supported = (key === 'profile' && selectedLevel !== 'Country') || availableViews.includes(key);
            return (
              <Fragment key={key}>
                {index > 0 && <span className="h-4 w-px bg-slate-200 self-center flex-shrink-0" />}
                <button
                  onClick={() => { if (supported) { setActiveView(key); } }}
                  disabled={!supported}
                  className={[
                    'px-3 text-sm font-medium transition-colors -mb-px border-b-2 whitespace-nowrap',
                    !supported
                      ? 'text-slate-300 border-transparent cursor-not-allowed'
                      : activeView === key
                        ? 'text-blue-600 border-blue-500'
                        : 'text-slate-500 border-transparent hover:text-slate-800 hover:border-slate-300',
                  ].join(' ')}
                >
                  {label}
                </button>
              </Fragment>
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Source attribution */}
          {activeDescriptor?.source && (
            <span className="hidden sm:flex items-center self-center mr-2 px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-500">
              Källa: {activeDescriptor.source}
            </span>
          )}

          {/* Party selector */}
          {electionResult && (activeView === 'map' || activeChartType === 'party-ranking') && (
            <div className="flex items-center gap-2 self-center pl-3 border-l border-slate-200">
              <SectionLabel className="hidden sm:inline">Parti</SectionLabel>
              <Dropdown
                inputSize="sm"
                value={activeParty ?? ''}
                onChange={val => setActiveParty(val || null)}
                options={[
                  { value: '', label: 'Vinnare' },
                  ...PARTY_CODES.map(p => ({ value: p, label: PARTY_LABELS[p] ?? p })),
                ]}
              />
            </div>
          )}

          {/* Bivariate toggle */}
          {activeView === 'map' && scalarResult && !electionResult && (
            <div className="hidden md:flex items-center self-center pl-3 border-l border-slate-200">
              <button
                onClick={() => setBivariateMode(m => !m)}
                title={bivariateMode ? 'Stäng 2D-läge' : 'Visa två variabler på kartan (bivariat)'}
                className={[
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
                  bivariateMode
                    ? 'bg-violet-50 border-violet-200 text-violet-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                ].join(' ')}
              >
                2D
              </button>
            </div>
          )}

          {/* Panel toggle */}
          <button
            onClick={() => {
              const opening = !isPanelOpen;
              userDismissedPanel.current = !opening;
              setIsPanelOpen(opening);
            }}
            title={isPanelOpen ? 'Dölj panel' : 'Visa detaljpanel'}
            className={[
              'self-center ml-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
              isPanelOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            ].join(' ')}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
              <line x1="10.5" y1="1.5" x2="10.5" y2="14.5" />
            </svg>
            <span className="hidden sm:inline">
              {isPanelOpen
                ? 'Dölj'
                : selectedFeature
                  ? comparisonFeature
                    ? `${selectedFeature.label} +1`
                    : selectedFeature.label
                  : 'Detaljer'}
            </span>
          </button>
        </div>

        {/* Context strip — breadcrumb navigation, only when a feature is selected on the map */}
        {activeView === 'map' && selectedFeature && (
          <div className="h-8 flex items-center px-3 border-b border-slate-100 bg-white flex-shrink-0 text-xs gap-1 overflow-x-auto">
            <button onClick={handleReset} className="text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap">
              Sverige
            </button>
            {breadcrumbAncestors.map(entry => (
              <span key={`${entry.level}-${entry.code}`} className="flex items-center gap-1">
                <span className="text-slate-300 mx-0.5">›</span>
                <button
                  onClick={() => handleBreadcrumbGoto(entry.code, entry.label, entry.level)}
                  className="text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap max-w-[9rem] truncate"
                  title={entry.label}
                >
                  {entry.label}
                </button>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="text-slate-300 mx-0.5">›</span>
              <span className="text-slate-700 font-medium whitespace-nowrap max-w-[10rem] truncate" title={selectedFeature.label}>
                {selectedFeature.label}
              </span>
            </span>
          </div>
        )}

        {/* Main view area */}
        <div className={`flex-1 flex min-h-0 relative ${isContentSized ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}>
          <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${isContentSized ? '' : 'overflow-hidden'}`}>
          {/* Chart type sub-selector */}
          {activeView === 'chart' && availableChartTypes.length > 1 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
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
              <SectionLabel className="whitespace-nowrap">Län</SectionLabel>
              <Dropdown
                inputSize="sm"
                value={effectiveMultilineLan ?? ''}
                onChange={code => {
                  if (selectedLevel === 'Region') {
                    setSelectedFeature({ code, label: COUNTY_NAMES[code] ?? code });
                  } else {
                    setSelectedLan(code);
                  }
                }}
                options={availableMultilineLans.map(({ code, name }) => ({ value: code, label: name }))}
              />
              {selectedLevel === 'Municipality' && (
                <>
                  <SectionLabel className="whitespace-nowrap ml-2">Kommun</SectionLabel>
                  <Dropdown
                    inputSize="sm"
                    value={effectiveMultilineMuni ?? ''}
                    onChange={code => {
                      const name = electionResult?.labels[code] ?? code;
                      setSelectedFeature({ code, label: name });
                    }}
                    options={availableMultilineMunis.map(({ code, name }) => ({ value: code, label: name }))}
                  />
                </>
              )}
            </div>
          )}

          {/* Lan / Municipality filter */}
          {activeView === 'chart' && needsLanFilter && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <SectionLabel className="whitespace-nowrap">Län</SectionLabel>
              <Dropdown
                inputSize="sm"
                value={effectiveLan ?? ''}
                onChange={code => setSelectedLan(code || null)}
                options={availableLans.map(({ code, name }) => ({ value: code, label: name }))}
              />
              {needsMuniFilter && (
                <>
                  <SectionLabel className="whitespace-nowrap ml-2">Kommun</SectionLabel>
                  <Dropdown
                    inputSize="sm"
                    value={effectiveMuni ?? ''}
                    onChange={code => setSelectedMuni(code || null)}
                    options={availableMunis.map(({ code, name }) => ({ value: code, label: name }))}
                  />
                </>
              )}
            </div>
          )}

          {/* Profile area search */}
          {activeView === 'profile' &&
           selectedLevel !== 'Country' &&
           profileSearchItems.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <div className="w-64">
                <FeatureSearch
                  items={profileSearchItems}
                  onSelect={handleFeatureSelect}
                />
              </div>
            </div>
          )}

          {/* Y-axis dataset selector for bivariate map */}
          {activeView === 'map' && bivariateMode && bivariateDatasets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-violet-50/60 flex-shrink-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-violet-500 whitespace-nowrap">Y-axel</label>
              <Dropdown
                inputSize="sm"
                value={bivariateYDatasetId ?? ''}
                onChange={val => setBivariateYDatasetId(val || null)}
                options={bivariateDatasets.map(d => ({ value: d.id, label: d.label }))}
              />
            </div>
          )}

          {/* Y-axis dataset selector for scatter chart */}
          {activeView === 'chart' && activeChartType === 'scatter' && scatterableDatasets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <SectionLabel className="whitespace-nowrap">Y-axel</SectionLabel>
              <Dropdown
                inputSize="sm"
                value={scatterYDatasetId ?? ''}
                onChange={val => setScatterYDatasetId(val || null)}
                options={scatterableDatasets.map(d => ({ value: d.id, label: d.label }))}
              />
            </div>
          )}

            <div className={`relative min-w-0 bg-slate-50 ${isContentSized ? '' : 'flex-1 overflow-hidden'}`} style={{ isolation: 'isolate' }}>
              <Suspense fallback={<Spinner />}>
                {activeView === 'map' && (
                  <MapView
                    adminLevel={selectedLevel}
                    selectedBase={selectedBase}
                    choroplethData={partyChoroplethValues ?? scalarResult?.values ?? null}
                    colorScale={bivariateFn ? null : colorScale}
                    mapColorFn={bivariateFn ?? mapColorFn}
                    tooltipData={tooltipData}
                    featureLabels={resultLabels}
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
                    fillOpacity={fillOpacity}
                  />
                )}
              </Suspense>

              {activeView === 'map' && bivariateFn && activeDescriptor && bivariateYDescriptor && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200/60 p-2.5 pointer-events-none">
                  <BivariateMapLegend
                    xLabel={`${activeDescriptor.label}${scalarResult?.unit ? ` (${scalarResult.unit})` : ''}`}
                    yLabel={`${bivariateYDescriptor.label}${bivariateYScalar?.unit ? ` (${bivariateYScalar.unit})` : ''}`}
                  />
                </div>
              )}
              {activeView === 'map' && !bivariateFn && legendData && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200/60 p-2.5 pointer-events-none">
                  <MapLegend data={legendData} scale={colorScale} year={selectedYear} source={activeDescriptor?.source} />
                </div>
              )}

              <Suspense fallback={<Spinner />}>
                {activeView === 'chart' && activeChartType === 'bar' && scalarResult && (
                  <div className="w-full p-6">
                    <RankedBarChart data={scalarResult} colorScale={colorScale} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} comparisonFeature={comparisonFeature} onComparisonSelect={handleComparisonSelect} matchingAreas={matchingAreas} />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'histogram' && scalarResult && (
                  <div className="w-full h-full p-6">
                    <Histogram data={scalarResult} colorScale={colorScale} />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'diverging' && filteredForDiverging && (
                  <div className="w-full p-6">
                    <DivergingBarChart data={filteredForDiverging} selectedFeature={selectedFeature} onFeatureSelect={handleFeatureSelect} comparisonFeature={comparisonFeature} onComparisonSelect={handleComparisonSelect} />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'election-bar' && partyShareData && (
                  <div className="w-full p-6">
                    <ShareBarChart
                      data={partyShareData}
                      sort="none"
                      selectedCode={selectedFeature?.code ?? null}
                      onSelect={handleFeatureSelect}
                    />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'share-bar' && categoricalResult && (
                  <div className="w-full p-6">
                    <ShareBarChart data={categoricalResult} />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'donut' && donutResult && (
                  <div className="w-full p-4 flex justify-center">
                    <DonutChart
                      items={donutResult.items}
                      size={160}
                      holeRatio={22 / 48}
                      legendPosition="right"
                      showCount
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
                      onComparisonSelect={activeDescriptor?.sunburstDepthToLevel ? handleComparisonSelect : undefined}
                      depthToLevel={activeDescriptor?.sunburstDepthToLevel}
                      onSelectionLevelChange={activeDescriptor?.sunburstDepthToLevel ? setSelectionLevel : undefined}
                      initialCode={selectedFeature?.code ?? undefined}
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
                        : (activeDescriptor?.timeSeriesLabel ?? activeDescriptor?.label)}
                      unit={activeDescriptor?.timeSeriesUnit}
                      colorOverrides={partyColorOverrides}
                    />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'party-ranking' && partyRankingResult && (
                  <div className="w-full p-6">
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
                      comparisonFeature={comparisonFeature}
                      onComparisonSelect={handleComparisonSelect}
                    />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'boxplot' && scalarResult && (
                  <div className="w-full p-6">
                    <BoxPlot
                      data={scalarResult}
                      colorScale={colorScale}
                      selectedFeature={selectedFeature}
                    />
                  </div>
                )}
                {activeView === 'chart' && activeChartType === 'multiline' && !timeSeriesData && timeSeriesLoading && (
                  <Spinner />
                )}
                {activeView === 'chart' && activeChartType !== 'sunburst' && activeChartType !== 'diverging' && activeChartType !== 'multiline' && activeChartType !== 'election-bar' && activeChartType !== 'party-ranking' && activeChartType !== 'scatter' && activeChartType !== 'boxplot' && activeChartType !== 'donut' && !datasetResult && (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Välj ett dataset för att visa diagram.
                  </div>
                )}
              </Suspense>

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

              {activeView === 'profile' && (
                <FeatureProfile selectedFeature={selectedFeature} adminLevel={selectionLevel} />
              )}
            </div>
          </div>

          {/* Backdrop: dims map when panel overlays it at sm–lg */}
          {isPanelOpen && (
            <div
              className="hidden sm:block md:hidden absolute inset-0 z-10 bg-black/20 transition-opacity duration-300"
              onClick={() => { userDismissedPanel.current = true; setIsPanelOpen(false); }}
            />
          )}
          <SelectionPanel
            selectedFeature={selectedFeature}
            adminLevel={selectionLevel}
            isOpen={isPanelOpen}
            onClose={() => { userDismissedPanel.current = true; setIsPanelOpen(false); }}
            comparisonFeature={comparisonFeature}
            onClearComparison={() => { setComparisonFeature(null); setSelectedFeature(null); userDismissedPanel.current = false; setIsPanelOpen(false); }}
            searchItems={searchItems}
            onSearchSelect={(item) => {
              // Infer the correct selectionLevel from the code so the panel
              // fetches at the right admin level (e.g. municipality codes appear
              // in election results at Country level).
              if (/^\d{4}$/.test(item.code))      { setSelectionLevel('Municipality'); }
              else if (/^\d{2}$/.test(item.code)) { setSelectionLevel('Region'); }
              handleFeatureSelect(item);
            }}
            onSearchComparisonSelect={(item) => {
              if (/^\d{4}$/.test(item.code))      { setSelectionLevel('Municipality'); }
              else if (/^\d{2}$/.test(item.code)) { setSelectionLevel('Region'); }
              handleComparisonSelect(item);
            }}
          />
        </div>
      </div>

      <KoladaBrowsePanel
        open={koladaBrowseOpen}
        onClose={() => setKoladaBrowseOpen(false)}
        pinnedKpiIds={pinnedKolada.pinnedKpiIds}
        pinnedConfigs={pinnedKolada.configs}
        onPin={pinnedKolada.pin}
        onUnpin={pinnedKolada.unpin}
      />

      <FilterBrowsePanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        selectedLevel={selectedLevel}
        filterEnabled={filterEnabled}
        onFilterEnabledChange={setFilterEnabled}
        criteria={filterCriteria}
        onCriteriaChange={setFilterCriteria}
        sortedValues={filterSortedValues}
        matchingCount={filterMatchingCount}
        loading={filterLoading}
      />
    </main>
  );
}
