import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import MapView from '@/components/map/MapView';
import { MapLegend } from '@/components/map/MapLegend';
import { RankedBarChart } from '@/components/visualizations/RankedBarChart';
import { Histogram } from '@/components/visualizations/Histogram';
import { DivergingBarChart } from '@/components/visualizations/DivergingBarChart';
import { SunburstWithBar } from '@/components/visualizations/SunburstWithBar';
import { DatasetTable } from '@/components/visualizations/DatasetTable';
import YearSlider from '@/components/common/YearSlider';
import {
  AdminLevel, ChartType, DatasetResult, GeoHierarchyNode,
  ViewType, viewsForLevel, chartTypesForLevel, CHART_TYPE_LABELS,
} from '@/datasets/types';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
import { fetchCached, fetchHierarchyCached, preload } from '@/datasets/cache';
import { BaseMapKey, baseMaps } from '@/components/map/BaseMaps';

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

const ADMIN_LEVELS: AdminLevel[] = ['Country', 'Region', 'Municipality', 'RegSO', 'DeSO'];

// Stable county code → short name mapping (without "län" suffix for compact display).
const COUNTY_NAMES: Record<string, string> = {
  '01': 'Stockholms',      '03': 'Uppsala',          '04': 'Södermanlands',
  '05': 'Östergötlands',   '06': 'Jönköpings',       '07': 'Kronobergs',
  '08': 'Kalmar',          '09': 'Gotlands',          '10': 'Blekinge',
  '12': 'Skåne',           '13': 'Hallands',          '14': 'Västra Götalands',
  '17': 'Värmlands',       '18': 'Örebro',            '19': 'Västmanlands',
  '20': 'Dalarnas',        '21': 'Gävleborgs',        '22': 'Västernorrlands',
  '23': 'Jämtlands',       '24': 'Västerbottens',     '25': 'Norrbottens',
};

const LEVEL_LABELS: Record<AdminLevel, string> = {
  Country:      'Nationell',
  Region:       'Län',
  Municipality: 'Kommun',
  RegSO:        'RegSO',
  DeSO:         'DeSO',
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
  const [datasetResult,     setDatasetResult]      = useState<DatasetResult | null>(null);
  const [hierarchyData,     setHierarchyData]      = useState<GeoHierarchyNode | null>(null);
  const [colorScale,        setColorScale]         = useState<d3.ScaleSequential<string> | null>(null);
  const [loading,           setLoading]            = useState(false);
  const [selectedBase,      setSelectedBase]       = useState<BaseMapKey>('EsriWorldGray');
  const [selectedLan,       setSelectedLan]        = useState<string | null>(null);
  const [selectedMuni,      setSelectedMuni]       = useState<string | null>(null);
  const [selectedFeature,   setSelectedFeature]    = useState<{ code: string; label: string } | null>(null);
  // Generation counter — incremented on every new fetch; stale responses are ignored.
  const fetchGenRef         = useRef(0);
  const yearDebounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When drill-down changes the admin level, this carries the clicked sub-feature
  // through the [selectedLevel] effect so it isn't cleared by the level-change reset.
  const pendingSelectionRef = useRef<{ code: string; label: string } | null>(null);

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) {clearTimeout(yearDebounceRef.current);}
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const handleDrillDown = (level: AdminLevel, code: string, label: string) => {
    pendingSelectionRef.current = { code, label };
    setSelectedLevel(level);
  };

  const availableDatasets = getDatasetsForLevel(selectedLevel);

  const activeDescriptor = DATASETS.find((d) => d.id === selectedDatasetId) ?? null;
  const availableViews   = activeDescriptor
    ? viewsForLevel(activeDescriptor, selectedLevel)
    : ['map' as ViewType];
  const availableChartTypes = activeDescriptor
    ? chartTypesForLevel(activeDescriptor, selectedLevel)
    : ['bar' as ChartType];

  // When admin level changes, preserve dataset if still available; otherwise reset.
  // If the change came from a drill-down, honour the pending selection instead of clearing it.
  useEffect(() => {
    const datasets = getDatasetsForLevel(selectedLevel);
    setSelectedDatasetId(id => datasets.some(d => d.id === id) ? id : (datasets[0]?.id ?? null));
    setDatasetResult(null);
    setHierarchyData(null);
    setColorScale(null);
    if (pendingSelectionRef.current) {
      setSelectedFeature(pendingSelectionRef.current);
      pendingSelectionRef.current = null;
    } else {
      setSelectedFeature(null);
    }
  }, [selectedLevel]);

  // When dataset changes, clamp year to the new dataset's available range.
  useEffect(() => {
    if (!selectedDatasetId) {return;}
    const descriptor = DATASETS.find(d => d.id === selectedDatasetId);
    if (!descriptor) {return;}
    const latest   = descriptor.availableYears.at(-1)!;
    const earliest = descriptor.availableYears[0];
    if (selectedYear > latest || selectedYear < earliest) {
      setSelectedYear(latest);
      setDisplayYear(latest);
    }
  }, [selectedDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [selectedLevel, selectedDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps


  // Fetch flat data when selected dataset or level changes.
  useEffect(() => {
    if (!selectedDatasetId) {
      setDatasetResult(null);
      setColorScale(null);
      return;
    }

    const descriptor = DATASETS.find((d) => d.id === selectedDatasetId);
    if (!descriptor) {return;}

    const gen = ++fetchGenRef.current;
    setLoading(true);

    fetchCached(descriptor, selectedLevel, selectedYear)
      .then((result) => {
        if (gen !== fetchGenRef.current) {return;} // superseded by a newer fetch

        const vals = Object.values(result.values).filter(Number.isFinite);
        const scale = d3
          .scaleSequential(t => d3.interpolateBlues(0.15 + t * 0.85))
          .domain([Math.min(...vals), Math.max(...vals)])
          .clamp(true);

        setDatasetResult(result);
        setColorScale(() => scale);
        setLoading(false);

        // Preload neighbouring admin levels in the background.
        const idx = ADMIN_LEVELS.indexOf(selectedLevel);
        const neighbours = [ADMIN_LEVELS[idx - 1], ADMIN_LEVELS[idx + 1]]
          .filter((l): l is AdminLevel => l !== undefined);
        preload(descriptor, neighbours, selectedYear);
      })
      .catch((err) => {
        if (gen === fetchGenRef.current) {
          console.error('Dataset fetch failed:', err);
          setLoading(false);
        }
      });
  }, [selectedDatasetId, selectedLevel, selectedYear]);

  // Fetch hierarchy data when sunburst is active and descriptor supports it.
  useEffect(() => {
    if (activeChartType !== 'sunburst' || !activeDescriptor?.fetchHierarchy) {return;}

    const gen = ++fetchGenRef.current;
    fetchHierarchyCached(activeDescriptor, selectedYear)
      .then(result => {
        if (gen !== fetchGenRef.current) {return;}
        setHierarchyData(result);
      })
      .catch(err => console.error('Hierarchy fetch failed:', err));
  }, [activeChartType, activeDescriptor, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Diverging chart filter (Municipality / RegSO / DeSO) ──────────────────
  const needsLanFilter  = activeChartType === 'diverging' &&
    (selectedLevel === 'Municipality' || selectedLevel === 'RegSO' || selectedLevel === 'DeSO');
  const needsMuniFilter = activeChartType === 'diverging' &&
    (selectedLevel === 'RegSO' || selectedLevel === 'DeSO');

  const availableLans = useMemo(() => {
    if (!datasetResult || !needsLanFilter) {return [];}
    const codes = new Set(Object.keys(datasetResult.values).map(c => c.slice(0, 2)));
    return [...codes].sort().map(c => ({ code: c, name: COUNTY_NAMES[c] ?? c }));
  }, [datasetResult, needsLanFilter]);

  // Effective Lan: honour stored selection if still valid, otherwise first in list.
  const effectiveLan = useMemo(() => {
    if (availableLans.length === 0) {return null;}
    return availableLans.some(l => l.code === selectedLan) ? selectedLan : availableLans[0].code;
  }, [availableLans, selectedLan]);

  const availableMunis = useMemo(() => {
    if (!datasetResult?.parentLabels || !effectiveLan || !needsMuniFilter) {return [];}
    return Object.entries(datasetResult.parentLabels)
      .filter(([code]) => code.startsWith(effectiveLan))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, name]) => ({ code, name }));
  }, [datasetResult, effectiveLan, needsMuniFilter]);

  // Effective muni: honour stored selection if still valid, otherwise first in list.
  const effectiveMuni = useMemo(() => {
    if (availableMunis.length === 0) {return null;}
    return availableMunis.some(m => m.code === selectedMuni) ? selectedMuni : availableMunis[0].code;
  }, [availableMunis, selectedMuni]);

  const filteredForDiverging = useMemo((): DatasetResult | null => {
    if (!datasetResult) {return null;}
    if (!needsLanFilter) {return datasetResult;}
    const filterCode = needsMuniFilter ? effectiveMuni : effectiveLan;
    if (!filterCode) {return null;}
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
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col p-4 gap-6 overflow-y-auto">
        {/* Admin level */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Nivå
          </h2>
          <ul className="flex flex-col gap-1">
            {ADMIN_LEVELS.map((level) => (
              <li key={level}>
                <button
                  onClick={() => setSelectedLevel(level)}
                  className={[
                    'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                    selectedLevel === level
                      ? 'bg-blue-100 text-blue-800 font-medium'
                      : 'text-gray-700 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {LEVEL_LABELS[level]}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Dataset list */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Dataset
          </h2>
          {availableDatasets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              Inga dataset för denna nivå.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {availableDatasets.map((ds) => (
                <li key={ds.id}>
                  <button
                    onClick={() => setSelectedDatasetId(ds.id)}
                    className={[
                      'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                      selectedDatasetId === ds.id
                        ? 'bg-blue-100 text-blue-800 font-medium'
                        : 'text-gray-700 hover:bg-gray-100',
                    ].join(' ')}
                  >
                    {ds.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Year slider — hidden at RegSO/DeSO (boundary-locked) */}
        {activeDescriptor && !['RegSO', 'DeSO'].includes(selectedLevel) && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              År: {displayYear}
            </h2>
            <YearSlider
              years={activeDescriptor.availableYears.map(String)}
              selectedYear={String(displayYear)}
              onYearChange={(y) => handleYearChange(Number(y))}
            />
          </section>
        )}

        {/* Base map */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Bakgrundskarta
          </h2>
          <select
            value={selectedBase}
            onChange={(e) => setSelectedBase(e.target.value as BaseMapKey)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700"
          >
            {(Object.keys(baseMaps) as BaseMapKey[]).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </section>
      </aside>

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

          <div className="flex-1 relative overflow-hidden">
            {activeView === 'map' && (
              <MapView
                adminLevel={selectedLevel}
                selectedBase={selectedBase}
                choroplethData={datasetResult?.values ?? null}
                colorScale={colorScale}
                featureCodeProperty={FEATURE_CODE_PROP[selectedLevel]}
                featureLabelProperty={FEATURE_LABEL_PROP[selectedLevel]}
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
                <RankedBarChart data={datasetResult} colorScale={colorScale} />
              </div>
            )}
            {activeView === 'chart' && activeChartType === 'histogram' && datasetResult && (
              <div className="w-full h-full p-6">
                <Histogram data={datasetResult} colorScale={colorScale} />
              </div>
            )}
            {activeView === 'chart' && activeChartType === 'diverging' && filteredForDiverging && (
              <div className="w-full h-full p-6">
                <DivergingBarChart data={filteredForDiverging} />
              </div>
            )}
            {activeView === 'chart' && activeChartType === 'sunburst' && hierarchyData && (
              <div className="w-full h-full p-4">
                <SunburstWithBar
                  root={hierarchyData}
                  unit={datasetResult?.unit ?? ''}
                  label={activeDescriptor?.label ?? ''}
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
                <DatasetTable data={datasetResult} />
              </div>
            )}
            {activeView === 'table' && !datasetResult && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Välj ett dataset för att visa tabell.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
