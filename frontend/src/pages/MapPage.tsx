import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import MapView from '@/components/map/MapView';
import { MapLegend } from '@/components/map/MapLegend';
import { RankedBarChart } from '@/components/visualizations/RankedBarChart';
import { Histogram } from '@/components/visualizations/Histogram';
import { SunburstWithBar } from '@/components/visualizations/SunburstWithBar';
import { DatasetTable } from '@/components/visualizations/DatasetTable';
import {
  AdminLevel, ChartType, DatasetResult, GeoHierarchyNode,
  ViewType, viewsForLevel, chartTypesForLevel, CHART_TYPE_LABELS,
} from '@/datasets/types';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
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
  const [activeView,        setActiveView]         = useState<ViewType>('map');
  const [activeChartType,   setActiveChartType]   = useState<ChartType>('bar');
  const [datasetResult,     setDatasetResult]      = useState<DatasetResult | null>(null);
  const [hierarchyData,     setHierarchyData]      = useState<GeoHierarchyNode | null>(null);
  const [colorScale,        setColorScale]         = useState<d3.ScaleSequential<string> | null>(null);
  const [loading,           setLoading]            = useState(false);
  const [selectedBase,      setSelectedBase]       = useState<BaseMapKey>('EsriWorldGray');
  const fetchAbortRef = useRef<AbortController | null>(null);

  const availableDatasets = getDatasetsForLevel(selectedLevel);

  const activeDescriptor = DATASETS.find((d) => d.id === selectedDatasetId) ?? null;
  const availableViews   = activeDescriptor
    ? viewsForLevel(activeDescriptor, selectedLevel)
    : ['map' as ViewType];
  const availableChartTypes = activeDescriptor
    ? chartTypesForLevel(activeDescriptor, selectedLevel)
    : ['bar' as ChartType];

  // When admin level changes, reset to first available dataset (or none).
  useEffect(() => {
    const datasets = getDatasetsForLevel(selectedLevel);
    setSelectedDatasetId(datasets[0]?.id ?? null);
    setDatasetResult(null);
    setHierarchyData(null);
    setColorScale(null);
  }, [selectedLevel]);

  // If the active view is no longer supported at the current level, fall back to map.
  useEffect(() => {
    if (!availableViews.includes(activeView)) {
      setActiveView('map');
    }
  }, [availableViews, activeView]);

  // When level or dataset changes, reset to the first available chart type.
  useEffect(() => {
    const types = activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType];
    setActiveChartType(types[0] ?? 'bar');
  }, [selectedLevel, selectedDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch flat data when selected dataset or level changes.
  useEffect(() => {
    if (!selectedDatasetId) {
      setDatasetResult(null);
      setColorScale(null);
      return;
    }

    const descriptor = DATASETS.find((d) => d.id === selectedDatasetId);
    if (!descriptor) return;

    fetchAbortRef.current?.abort();
    fetchAbortRef.current = new AbortController();

    setLoading(true);
    descriptor
      .fetch(selectedLevel)
      .then((result) => {
        const vals = Object.values(result.values).filter(Number.isFinite);
        const min = Math.min(...vals);
        const max = Math.max(...vals);

        const scale = d3
          .scaleSequential(d3.interpolateBlues)
          .domain([min, max])
          .clamp(true);

        setDatasetResult(result);
        setColorScale(() => scale);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          console.error('Dataset fetch failed:', err);
          setLoading(false);
        }
      });
  }, [selectedDatasetId, selectedLevel]);

  // Fetch hierarchy data when sunburst is active and descriptor supports it.
  useEffect(() => {
    if (activeChartType !== 'sunburst' || !activeDescriptor?.fetchHierarchy) {
      return;
    }
    if (hierarchyData) return; // already loaded

    activeDescriptor.fetchHierarchy()
      .then(setHierarchyData)
      .catch(err => console.error('Hierarchy fetch failed:', err));
  }, [activeChartType, activeDescriptor]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {activeView === 'chart' && activeChartType !== 'sunburst' && !datasetResult && (
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
