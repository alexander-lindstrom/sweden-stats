import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from '@/components/map/MapView';
import { MapLegend } from '@/components/map/MapLegend';
import { MapSidebar } from '@/components/map/MapSidebar';
import { SelectionPanel } from '@/components/map/SelectionPanel';
import { RankedBarChart } from '@/components/visualizations/RankedBarChart';
import { Histogram } from '@/components/visualizations/Histogram';
import { DivergingBarChart } from '@/components/visualizations/DivergingBarChart';
import { SunburstWithBar } from '@/components/visualizations/SunburstWithBar';
import { DatasetTable } from '@/components/visualizations/DatasetTable';
import {
  AdminLevel, ChartType, ViewType,
  viewsForLevel, chartTypesForLevel, CHART_TYPE_LABELS,
} from '@/datasets/types';
import { DATASETS, getDatasetsForLevel } from '@/datasets/registry';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { BaseMapKey } from '@/components/map/BaseMaps';
import { useDatasetFetch } from '@/hooks/useDatasetFetch';
import { useHierarchyFetch } from '@/hooks/useHierarchyFetch';
import { useMapKeyboardNavigation } from '@/hooks/useMapKeyboardNavigation';

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
// Used to store parentCode on selectedFeature so Escape can navigate up.
const FEATURE_PARENT_PROP: Partial<Record<AdminLevel, string>> = {
  RegSO: 'kommunkod',
  DeSO:  'regsokod',  // DeSO parent is RegSO, not Municipality
};

const ALL_VIEWS: { key: ViewType; label: string }[] = [
  { key: 'map',   label: 'Karta'   },
  { key: 'chart', label: 'Diagram' },
  { key: 'table', label: 'Tabell'  },
];

export default function MapPage() {
  const [selectedLevel,     setSelectedLevel]     = useState<AdminLevel>('Region');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedYear,      setSelectedYear]       = useState<number>(2024); // debounced — drives fetches
  const [displayYear,       setDisplayYear]        = useState<number>(2024); // immediate — drives slider UI
  const [activeView,        setActiveView]         = useState<ViewType>('map');
  const [activeChartType,   setActiveChartType]   = useState<ChartType>('bar');
  const [selectedBase,      setSelectedBase]       = useState<BaseMapKey>('None');
  const [selectedLan,       setSelectedLan]        = useState<string | null>(null);
  const [selectedMuni,      setSelectedMuni]       = useState<string | null>(null);
  const [selectedFeature,   setSelectedFeature]    = useState<{ code: string; label: string; parentCode?: string } | null>(null);
  const [selectionLevel,    setSelectionLevel]     = useState<AdminLevel>(selectedLevel);
  const [isPanelOpen,       setIsPanelOpen]        = useState(false);

  const yearDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Carries a clicked sub-feature through the [selectedLevel] effect so it
  // isn't cleared by the level-change reset.
  const pendingSelectionRef = useRef<{ code: string; label: string; parentCode?: string } | null>(null);

  const { datasetResult, colorScale, loading } = useDatasetFetch(selectedDatasetId, selectedLevel, selectedYear);
  const activeDescriptor = DATASETS.find((d) => d.id === selectedDatasetId) ?? null;
  const hierarchyData    = useHierarchyFetch(activeDescriptor, activeChartType, selectedYear);

  useMapKeyboardNavigation(
    selectedFeature,
    selectedLevel,
    datasetResult,
    setSelectedLevel,
    setSelectedFeature,
    pendingSelectionRef,
  );

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) { clearTimeout(yearDebounceRef.current); }
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const handleDrillDown = (level: AdminLevel, code: string, label: string, parentCode?: string) => {
    pendingSelectionRef.current = { code, label, parentCode };
    setSelectedLevel(level);
  };

  // Auto-open the panel whenever a feature is selected.
  useEffect(() => {
    if (selectedFeature) { setIsPanelOpen(true); }
  }, [selectedFeature]);

  // When a feature is selected, auto-derive the diverging-chart filter so the
  // selected item is always visible in the chart without manual filter changes.
  // All admin codes start with a 2-digit county prefix; RegSO/DeSO codes also
  // embed the 4-digit municipality prefix (e.g. '0114R001' → muni '0114').
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
  // If the change came from a drill-down, honour the pending selection instead of clearing it.
  useEffect(() => {
    const datasets = getDatasetsForLevel(selectedLevel);
    setSelectedDatasetId(id => datasets.some(d => d.id === id) ? id : (datasets[0]?.id ?? null));
    setSelectionLevel(selectedLevel);
    if (pendingSelectionRef.current) {
      setSelectedFeature(pendingSelectionRef.current);
      pendingSelectionRef.current = null;
    } else {
      setSelectedFeature(null);
    }
  }, [selectedLevel]);

  // When dataset changes, clamp year to the new dataset's available range.
  useEffect(() => {
    if (!selectedDatasetId) { return; }
    const descriptor = DATASETS.find(d => d.id === selectedDatasetId);
    if (!descriptor) { return; }
    const latest   = descriptor.availableYears.at(-1)!;
    const earliest = descriptor.availableYears[0];
    if (selectedYear > latest || selectedYear < earliest) {
      setSelectedYear(latest);
      setDisplayYear(latest);
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

  // If the active view is no longer supported at the current level, fall back to first available.
  useEffect(() => {
    if (!availableViews.includes(activeView)) {
      setActiveView(availableViews[0] ?? 'map');
    }
  }, [availableViews, activeView]);

  // When level or dataset changes, preserve chart type if still available; otherwise reset.
  useEffect(() => {
    const types = activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType];
    setActiveChartType(ct => types.includes(ct) ? ct : (types[0] ?? 'bar'));
  }, [selectedLevel, activeDescriptor]);

  // ── Diverging chart filter (Municipality / RegSO / DeSO) ──────────────────
  const needsLanFilter  = activeChartType === 'diverging' &&
    (selectedLevel === 'Municipality' || selectedLevel === 'RegSO' || selectedLevel === 'DeSO');
  const needsMuniFilter = activeChartType === 'diverging' &&
    (selectedLevel === 'RegSO' || selectedLevel === 'DeSO');

  const availableLans = useMemo(() => {
    if (!datasetResult || !needsLanFilter) { return []; }
    const codes = new Set(Object.keys(datasetResult.values).map(c => c.slice(0, 2)));
    return [...codes].sort().map(c => ({ code: c, name: COUNTY_NAMES[c] ?? c }));
  }, [datasetResult, needsLanFilter]);

  // Effective Lan: honour stored selection if still valid, otherwise first in list.
  const effectiveLan = useMemo(() => {
    if (availableLans.length === 0) { return null; }
    return availableLans.some(l => l.code === selectedLan) ? selectedLan : availableLans[0].code;
  }, [availableLans, selectedLan]);

  const availableMunis = useMemo(() => {
    if (!datasetResult?.parentLabels || !effectiveLan || !needsMuniFilter) { return []; }
    return Object.entries(datasetResult.parentLabels)
      .filter(([code]) => code.startsWith(effectiveLan))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => ({ code, name }));
  }, [datasetResult, effectiveLan, needsMuniFilter]);

  // Effective muni: honour stored selection if still valid, otherwise first in list.
  const effectiveMuni = useMemo(() => {
    if (availableMunis.length === 0) { return null; }
    return availableMunis.some(m => m.code === selectedMuni) ? selectedMuni : availableMunis[0].code;
  }, [availableMunis, selectedMuni]);

  const filteredForDiverging = useMemo(() => {
    if (!datasetResult) { return null; }
    if (!needsLanFilter) { return datasetResult; }
    const filterCode = needsMuniFilter ? effectiveMuni : effectiveLan;
    if (!filterCode) { return null; }
    const values = Object.fromEntries(
      Object.entries(datasetResult.values).filter(([code]) => code.startsWith(filterCode))
    );
    const labels = Object.fromEntries(
      Object.entries(datasetResult.labels).filter(([code]) => code.startsWith(filterCode))
    );
    return { ...datasetResult, values, labels };
  }, [datasetResult, needsLanFilter, needsMuniFilter, effectiveLan, effectiveMuni]);

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <MapSidebar
        selectedLevel={selectedLevel}
        onLevelChange={setSelectedLevel}
        selectedDatasetId={selectedDatasetId}
        onDatasetChange={setSelectedDatasetId}
        activeDescriptor={activeDescriptor}
        displayYear={displayYear}
        onYearChange={handleYearChange}
        selectedBase={selectedBase}
        onBaseChange={setSelectedBase}
      />

      {/* ── Centre panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* View toggle bar */}
        <div className="flex items-center gap-1 border-b border-gray-200 px-4 py-2 bg-white flex-shrink-0">
          {ALL_VIEWS.map(({ key, label }) => {
            const supported = availableViews.includes(key);
            return (
              <button
                key={key}
                onClick={() => { if (supported) { setActiveView(key); } }}
                disabled={!supported}
                className={[
                  'px-4 py-1 rounded text-sm font-medium transition-colors',
                  !supported
                    ? 'text-gray-300 cursor-not-allowed'
                    : activeView === key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
          {loading && (
            <span className="ml-4 text-xs text-gray-400 animate-pulse">
              Laddar data…
            </span>
          )}
          {activeDescriptor && (
            <span className="ml-auto text-xs text-gray-400">
              Källa: {activeDescriptor.source} · {selectedYear}
            </span>
          )}
          <button
            onClick={() => setIsPanelOpen(p => !p)}
            title={isPanelOpen ? 'Dölj panel' : 'Visa panel'}
            className={[
              'ml-2 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border',
              isPanelOpen
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
            ].join(' ')}
          >
            {isPanelOpen ? '▶ Dölj' : '◀ Detaljer'}
          </button>
        </div>

        {/* Main view area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Chart type sub-selector — only shown in chart view with >1 type */}
          {activeView === 'chart' && availableChartTypes.length > 1 && (
            <div className="flex gap-1 px-6 pt-3 pb-1 border-b border-gray-100 flex-shrink-0">
              {availableChartTypes.map(ct => (
                <button
                  key={ct}
                  onClick={() => setActiveChartType(ct)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    activeChartType === ct
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {CHART_TYPE_LABELS[ct]}
                </button>
              ))}
            </div>
          )}

          {/* Län / Municipality filter — shown for diverging chart at sub-county levels */}
          {activeView === 'chart' && needsLanFilter && (
            <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 text-sm">
              <label className="text-gray-500 whitespace-nowrap">Län:</label>
              <select
                value={effectiveLan ?? ''}
                onChange={e => setSelectedLan(e.target.value || null)}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white text-gray-700"
              >
                {availableLans.map(({ code, name }) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              {needsMuniFilter && (
                <>
                  <label className="text-gray-500 whitespace-nowrap ml-2">Kommun:</label>
                  <select
                    value={effectiveMuni ?? ''}
                    onChange={e => setSelectedMuni(e.target.value || null)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white text-gray-700"
                  >
                    {availableMunis.map(({ code, name }) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="flex-1 relative overflow-hidden min-w-0" style={{ isolation: 'isolate' }}>
              {activeView === 'map' && (
                <MapView
                  adminLevel={selectedLevel}
                  selectedBase={selectedBase}
                  choroplethData={datasetResult?.values ?? null}
                  colorScale={colorScale}
                  featureCodeProperty={FEATURE_CODE_PROP[selectedLevel]}
                  featureLabelProperty={FEATURE_LABEL_PROP[selectedLevel]}
                  featureParentProperty={FEATURE_PARENT_PROP[selectedLevel]}
                  unit={datasetResult?.unit ?? ''}
                  selectedFeature={selectedFeature}
                  onFeatureSelect={setSelectedFeature}
                  onDrillDown={handleDrillDown}
                />
              )}
              {activeView === 'map' && datasetResult && (
                <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 pointer-events-none">
                  <MapLegend data={datasetResult} scale={colorScale} />
                </div>
              )}

              {activeView === 'chart' && activeChartType === 'bar' && datasetResult && (
                <div className="w-full h-full p-6">
                  <RankedBarChart data={datasetResult} colorScale={colorScale} selectedFeature={selectedFeature} onFeatureSelect={setSelectedFeature} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'histogram' && datasetResult && (
                <div className="w-full h-full p-6">
                  <Histogram data={datasetResult} colorScale={colorScale} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'diverging' && filteredForDiverging && (
                <div className="w-full h-full p-6">
                  <DivergingBarChart data={filteredForDiverging} selectedFeature={selectedFeature} onFeatureSelect={setSelectedFeature} />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'sunburst' && hierarchyData && (
                <div className="w-full h-full p-4">
                  <SunburstWithBar
                    root={hierarchyData}
                    unit={datasetResult?.unit ?? ''}
                    label={activeDescriptor?.label ?? ''}
                    onFeatureSelect={setSelectedFeature}
                    depthToLevel={['Country', 'Region', 'Municipality']}
                    onSelectionLevelChange={setSelectionLevel}
                  />
                </div>
              )}
              {activeView === 'chart' && activeChartType === 'sunburst' && !hierarchyData && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm animate-pulse">
                  Laddar hierarki…
                </div>
              )}
              {activeView === 'chart' && activeChartType !== 'sunburst' && activeChartType !== 'diverging' && !datasetResult && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Välj ett dataset för att visa diagram.
                </div>
              )}

              {activeView === 'table' && datasetResult && (
                <div className="w-full h-full p-6">
                  <DatasetTable data={datasetResult} selectedFeature={selectedFeature} onFeatureSelect={setSelectedFeature} />
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
            />
          </div>
        </div>
      </div>
    </main>
  );
}
