import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import MapView from '@/components/map/MapView';
import { MapLegend } from '@/components/map/MapLegend';
import { AdminLevel, DatasetResult, ViewType } from '@/datasets/types';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
import { BaseMapKey, baseMaps } from '@/components/map/BaseMaps';

// Feature property used to look up the choropleth value for each admin level's
// child boundary layer.  Only Region (county_code) is confirmed from GeoServer;
// the others are placeholders to fill in once the layers are inspected.
const FEATURE_CODE_PROP: Record<AdminLevel, string> = {
  Country:      'county_code',
  Region:       'muni_code',   // TODO: confirm Municipality layer property name
  Municipality: 'regso',       // TODO: confirm RegSO layer property name
  RegSO:        'deso',        // TODO: confirm DeSO layer property name
  DeSO:         'deso',
};

const ADMIN_LEVELS: AdminLevel[] = ['Country', 'Region', 'Municipality', 'RegSO', 'DeSO'];

const LEVEL_LABELS: Record<AdminLevel, string> = {
  Country:      'Country',
  Region:       'Region (Län)',
  Municipality: 'Municipality (Kommun)',
  RegSO:        'RegSO',
  DeSO:         'DeSO',
};

const VIEW_OPTIONS: { key: ViewType; label: string }[] = [
  { key: 'map',   label: 'Map'   },
  { key: 'chart', label: 'Chart' },
  { key: 'table', label: 'Table' },
];

export default function MapPage() {
  const [selectedLevel,     setSelectedLevel]     = useState<AdminLevel>('Country');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [activeView,        setActiveView]         = useState<ViewType>('map');
  const [datasetResult,     setDatasetResult]      = useState<DatasetResult | null>(null);
  const [colorScale,        setColorScale]         = useState<d3.ScaleSequential<string> | null>(null);
  const [loading,           setLoading]            = useState(false);
  const [selectedBase,      setSelectedBase]       = useState<BaseMapKey>('EsriWorldGray');
  const fetchAbortRef = useRef<AbortController | null>(null);

  const availableDatasets = getDatasetsForLevel(selectedLevel);

  // When admin level changes, reset to first available dataset (or none)
  useEffect(() => {
    const datasets = getDatasetsForLevel(selectedLevel);
    setSelectedDatasetId(datasets[0]?.id ?? null);
    setDatasetResult(null);
    setColorScale(null);
  }, [selectedLevel]);

  // Fetch data when selected dataset changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setDatasetResult(null);
      setColorScale(null);
      return;
    }

    const descriptor = DATASETS.find((d) => d.id === selectedDatasetId);
    if (!descriptor) return;

    // Abort any in-flight request
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

  const featureCodeProperty = FEATURE_CODE_PROP[selectedLevel];

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col p-4 gap-6 overflow-y-auto">
        {/* Admin level */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Admin Level
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
              No datasets for this level yet.
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
            Base Map
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
          {VIEW_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveView(key)}
              className={[
                'px-4 py-1 rounded text-sm font-medium transition-colors',
                activeView === key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          {loading && (
            <span className="ml-4 text-xs text-gray-400 animate-pulse">
              Loading data…
            </span>
          )}
        </div>

        {/* Main view area */}
        <div className="flex-1 relative overflow-hidden">
          {activeView === 'map' && (
            <MapView
              adminLevel={selectedLevel}
              selectedBase={selectedBase}
              choroplethData={datasetResult?.values ?? null}
              colorScale={colorScale}
              featureCodeProperty={featureCodeProperty}
            />
          )}
          {activeView === 'chart' && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Chart view — coming soon
            </div>
          )}
          {activeView === 'table' && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Table view — coming soon
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar (legend) ───────────────────────────────────────── */}
      <aside className="w-48 flex-shrink-0 border-l border-gray-200 bg-white p-4">
        <MapLegend data={datasetResult} scale={colorScale} />
      </aside>
    </main>
  );
}
