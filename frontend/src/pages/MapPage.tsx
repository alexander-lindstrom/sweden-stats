import { useEffect, useMemo, useRef, useState } from 'react';
import { FeatureProfile } from '@/components/profile/FeatureProfile';
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
import { ShareBarChart } from '@/components/visualizations/ShareBarChart';
import { DonutChart } from '@/components/visualizations/DonutChart';
import { ScatterPlot } from '@/components/visualizations/ScatterPlot';
import { BoxPlot } from '@/components/visualizations/BoxPlot';
import { FeatureSearch } from '@/components/ui/FeatureSearch';
import {
  AdminLevel, ChartType, ViewType, ScalarDatasetResult, FilterCriterion,
  viewsForLevel, chartTypesForLevel, CHART_TYPE_LABELS,
  CategoryShare, CategoricalShareResult,
} from '@/datasets/types';
import { DATASETS, getDatasetsForLevel } from '@/datasets/registry';
import { preload } from '@/datasets/cache';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { getMunicipalityLabels, ensureMunicipalityLabels } from '@/datasets/scb/population';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { BaseMapKey } from '@/components/map/BaseMaps';
import { useDatasetFetch } from '@/hooks/useDatasetFetch';
import { useHierarchyFetch } from '@/hooks/useHierarchyFetch';
import { useTimeSeriesFetch } from '@/hooks/useTimeSeriesFetch';
import { useFilterMode } from '@/hooks/useFilterMode';
import { useMapKeyboardNavigation, type DrillStackEntry } from '@/hooks/useMapKeyboardNavigation';
import { stripLanSuffix } from '@/utils/labelFormatting';
import { TopLoadingBar } from '@/components/ui/TopLoadingBar';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
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
  const [isPanelOpen,         setIsPanelOpen]         = useState(false);
  const userDismissedPanel    = useRef(false);
  const [desktopSidebarOpen,  setDesktopSidebarOpen]  = useState(true);
  const [mobileSidebarOpen,   setMobileSidebarOpen]   = useState(false);
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

  const [drillStack, setDrillStack] = useState<DrillStackEntry[]>([]);
  const [munLabels,  setMunLabels]  = useState<Record<string, string> | null>(() => getMunicipalityLabels());

  useEffect(() => {
    if (munLabels) { return; }
    ensureMunicipalityLabels().then(setMunLabels).catch(() => {});
  }, [munLabels]);

  const breadcrumbAncestors = useMemo(() => {
    if (!selectedFeature) { return []; }
    const countyCode = selectedFeature.code.slice(0, 2);
    const munCode    = selectedFeature.code.slice(0, 4);
    if (selectedLevel === 'Municipality') {
      const lbl = COUNTY_NAMES[countyCode];
      return lbl ? [{ code: countyCode, label: lbl, level: 'Region' as AdminLevel }] : [];
    }
    if (selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      const countyLbl = COUNTY_NAMES[countyCode];
      const munLbl    = munLabels?.[munCode] ?? munCode;
      const ancestors: Array<{ code: string; label: string; level: AdminLevel }> = [];
      if (countyLbl) { ancestors.push({ code: countyCode, label: countyLbl, level: 'Region' }); }
      ancestors.push({ code: munCode, label: munLbl, level: 'Municipality' });
      return ancestors;
    }
    return [];
  }, [selectedFeature, selectedLevel, munLabels]);

  const yearDebounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<{ code: string; label: string; parentCode?: string } | null>(null);

  const { datasetResult, colorScale, mapColorFn, loading } = useDatasetFetch(
    selectedDatasetId, selectedLevel, selectedYear, activeParty,
  );

  const scalarResult        = datasetResult?.kind === 'scalar'            ? datasetResult as ScalarDatasetResult : null;
  const electionResult      = datasetResult?.kind === 'election'          ? datasetResult : null;
  const categoricalResult   = datasetResult?.kind === 'categorical-share' ? datasetResult : null;
  const donutResult         = datasetResult?.kind === 'donut'             ? datasetResult : null;
  const resultLabels        = scalarResult?.labels ?? electionResult?.labels;

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

  const activeDescriptor = DATASETS.find((d) => d.id === selectedDatasetId) ?? null;
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
  }, [selectionLevel, selectedLevel, datasetResult, hierarchyData, activeDescriptor]);

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
    drillStack, setDrillStack,
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
    setDrillStack([]);
    setSelectedLevel('Region');
    setSelectedFeature(null);
    setComparisonFeature(null);
    setActiveView('map');
    userDismissedPanel.current = false;
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
    // Push the current position onto the drill stack so we can retrace later.
    if (selectedFeature) {
      setDrillStack(s => [...s, { level: selectedLevel, code: selectedFeature.code, label: selectedFeature.label }]);
    }
    pendingSelectionRef.current = { code, label, parentCode };
    setSelectedLevel(level);
  };

  /**
   * Navigate to a geographically-derived ancestor from the breadcrumb.
   * Clears the drill stack since the user is explicitly jumping up the hierarchy.
   */
  const handleBreadcrumbGoto = (code: string, label: string, level: AdminLevel) => {
    setDrillStack([]);
    pendingSelectionRef.current = { code, label };
    setSelectedLevel(level);
  };

  useEffect(() => {
    if (selectedFeature) { if (!userDismissedPanel.current) { setIsPanelOpen(true); } }
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
    if ((activeView === 'profile' && selectedLevel === 'Country') || (activeView !== 'profile' && !availableViews.includes(activeView))) {
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

  // ── Profile search items ──────────────────────────────────────────────────
  // Reuses the existing searchItems (from datasetResult.labels). Falls back to munLabels
  // at Municipality level so the search box is always populated without needing a dataset.
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
        onFilterEnabledChange={setFilterEnabled}
        filterCriteria={filterCriteria}
        onFilterCriteriaChange={setFilterCriteria}
        filterSortedValues={filterSortedValues}
        filterMatchingCount={filterMatchingCount}
        filterLoading={filterLoading}
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
          {ALL_VIEWS.map(({ key, label }) => {
            const supported = (key === 'profile' && selectedLevel !== 'Country') || availableViews.includes(key);
            return (
              <button
                key={key}
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
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Dataset info pill — hidden on mobile */}
          {activeDescriptor && (
            <div className="hidden sm:flex items-center gap-1.5 self-center mr-2 bg-slate-50 border border-slate-200 rounded-full px-3 py-0.5">
              <span className="text-xs font-semibold text-slate-600 max-w-[10rem] truncate">{activeDescriptor.label}</span>
              <span className="text-slate-300 text-xs select-none">·</span>
              <span className="text-xs text-slate-400">{activeDescriptor.source}</span>
              <span className="text-slate-300 text-xs select-none">·</span>
              <span className="text-xs text-slate-400 tabular-nums">{selectedYear}</span>
            </div>
          )}

          {/* Party selector */}
          {electionResult && (activeView === 'map' || activeChartType === 'party-ranking') && (
            <div className="flex items-center gap-2 self-center pl-3 border-l border-slate-200">
              <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Parti</span>
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
            <div className="flex items-center self-center pl-3 border-l border-slate-200">
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

        {/* Main view area */}
        <div className={`flex-1 flex min-h-0 relative ${isContentSized ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}>
          <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${isContentSized ? '' : 'overflow-hidden'}`}>
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
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ml-2">Kommun</label>
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
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Län</label>
              <Dropdown
                inputSize="sm"
                value={effectiveLan ?? ''}
                onChange={code => setSelectedLan(code || null)}
                options={availableLans.map(({ code, name }) => ({ value: code, label: name }))}
              />
              {needsMuniFilter && (
                <>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ml-2">Kommun</label>
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
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Y-axel</label>
              <Dropdown
                inputSize="sm"
                value={scatterYDatasetId ?? ''}
                onChange={val => setScatterYDatasetId(val || null)}
                options={scatterableDatasets.map(d => ({ value: d.id, label: d.label }))}
              />
            </div>
          )}

            <div className={`relative min-w-0 bg-slate-50 ${isContentSized ? '' : 'flex-1 overflow-hidden'}`} style={{ isolation: 'isolate' }}>
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
                />
              )}
              {/* Breadcrumb — overlaid on the map, centred along the top */}
              {activeView === 'map' && selectedFeature && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm px-3 py-1.5 text-xs pointer-events-auto select-none">
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
                  <MapLegend data={legendData} scale={colorScale} />
                </div>
              )}

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
                <div className="w-full p-8 flex justify-center">
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
    </main>
  );
}
