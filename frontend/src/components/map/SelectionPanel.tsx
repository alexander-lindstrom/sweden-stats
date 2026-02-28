import { useEffect, useRef, useState } from 'react';
import { AdminLevel } from '@/datasets/types';
import { fetchCached } from '@/datasets/cache';
import { DATASETS } from '@/datasets/registry';

const LEVEL_LABELS: Record<AdminLevel, string> = {
  Country:      'Nationell',
  Region:       'Län',
  Municipality: 'Kommun',
  RegSO:        'RegSO',
  DeSO:         'DeSO',
};

const LEVEL_BADGE: Record<AdminLevel, string> = {
  Country:      'bg-gray-100 text-gray-600',
  Region:       'bg-blue-100 text-blue-700',
  Municipality: 'bg-teal-100 text-teal-700',
  RegSO:        'bg-orange-100 text-orange-700',
  DeSO:         'bg-rose-100 text-rose-700',
};

// Population dataset is the source of truth for the summary panel.
// It covers all admin levels and shares the session cache with the main map.
const popDescriptor = DATASETS.find(d => d.id === 'population')!;
const POPULATION_YEAR = 2024;

interface PanelData {
  population: number | null;
  unit: string;
  rank: number | null;
  peerCount: number | null;
}

export interface SelectionPanelProps {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
  isOpen: boolean;
  onClose: () => void;
}

export function SelectionPanel({ selectedFeature, adminLevel, isOpen, onClose }: SelectionPanelProps) {
  const [data, setData]       = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchIdRef            = useRef(0);

  useEffect(() => {
    if (!selectedFeature) {
      setData(null);
      return;
    }

    const id = ++fetchIdRef.current;
    setData(null);
    setLoading(true);

    fetchCached(popDescriptor, adminLevel, POPULATION_YEAR)
      .then(result => {
        if (id !== fetchIdRef.current) { return; }

        const value      = result.values[selectedFeature.code] ?? null;
        const allValues  = Object.values(result.values).filter(Number.isFinite);
        const rank       = value !== null ? allValues.filter(v => v > value).length + 1 : null;

        setData({
          population: value,
          unit:       result.unit,
          rank,
          peerCount:  allValues.length,
        });
      })
      .catch(() => { /* silently leave data as null */ })
      .finally(() => { if (id === fetchIdRef.current) { setLoading(false); } });
  }, [selectedFeature, adminLevel]);

  if (!isOpen) { return null; }

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl flex flex-col z-20">

      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${LEVEL_BADGE[adminLevel]}`}>
            {LEVEL_LABELS[adminLevel]}
          </span>
          <h2 className="text-sm font-semibold text-gray-900 leading-snug">
            {selectedFeature?.label ?? <span className="text-gray-400 italic">Inget valt</span>}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Stäng panel"
          className="flex-shrink-0 mt-0.5 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">

        {!selectedFeature && (
          <p className="text-sm text-gray-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Befolkning {POPULATION_YEAR}
            </h3>

            {loading && (
              <p className="text-sm text-gray-400 animate-pulse">Laddar…</p>
            )}

            {!loading && data && (
              <div className="space-y-1">
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {data.population !== null
                    ? data.population.toLocaleString('sv-SE')
                    : '—'}
                </div>
                <div className="text-xs text-gray-500">{data.unit}</div>

                {data.rank !== null && data.peerCount !== null && (
                  <div className="mt-3 text-sm text-gray-600">
                    Rank{' '}
                    <span className="font-semibold text-gray-900">
                      #{data.rank}
                    </span>
                    {' '}av {data.peerCount}
                  </div>
                )}
              </div>
            )}

            {!loading && !data && (
              <p className="text-sm text-gray-400">Ingen data tillgänglig.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
