import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminLevel, FilterCriterion, ScalarDatasetResult } from '@/datasets/types';
import { DATASETS } from '@/datasets/registry';
import { fetchCached } from '@/datasets/cache';

interface FilterModeResult {
  matchingAreas:   Set<string> | null;
  fetchedDatasets: Record<string, ScalarDatasetResult>;
  loading:         boolean;
}

export function useFilterMode(
  criteria: FilterCriterion[],
  level:    AdminLevel,
  year:     number,
  enabled:  boolean,
): FilterModeResult {
  const [fetchedDatasets, setFetchedDatasets] = useState<Record<string, ScalarDatasetResult>>({});
  const [loading,         setLoading]         = useState(false);
  const fetchGenRef     = useRef(0);
  const lastFetchKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || criteria.length === 0) {
      lastFetchKeyRef.current = '';
      setFetchedDatasets({});
      setLoading(false);
      return;
    }

    const ids = [...new Set(criteria.map(c => c.datasetId))].sort();
    const key = `${ids.join(',')}|${level}|${year}`;

    // Skip re-fetch when only thresholds changed, not the dataset/level/year combination.
    if (key === lastFetchKeyRef.current) { return; }
    lastFetchKeyRef.current = key;

    const gen = ++fetchGenRef.current;
    setLoading(true);

    Promise.all(
      ids.map(id => {
        const descriptor = DATASETS.find(d => d.id === id);
        if (!descriptor) { return Promise.resolve(null); }
        return fetchCached(descriptor, level, year).then(r => ({ id, r }));
      }),
    ).then(results => {
      if (gen !== fetchGenRef.current) { return; }
      const map: Record<string, ScalarDatasetResult> = {};
      for (const res of results) {
        if (res && res.r.kind === 'scalar') {
          map[res.id] = res.r as ScalarDatasetResult;
        }
      }
      setFetchedDatasets(map);
      setLoading(false);
    }).catch(() => {
      if (gen === fetchGenRef.current) { setLoading(false); }
    });
  }, [enabled, criteria, level, year]);

  const matchingAreas = useMemo<Set<string> | null>(() => {
    if (!enabled || criteria.length === 0) { return null; }

    // Only criteria with a finite threshold actually filter.
    const activeCriteria = criteria.filter(c => Number.isFinite(c.absoluteThreshold));
    if (activeCriteria.length === 0) { return null; }

    const firstResult = Object.values(fetchedDatasets)[0];
    if (!firstResult) { return null; }

    const allCodes = Object.keys(firstResult.values);
    const matching = allCodes.filter(code =>
      activeCriteria.every(criterion => {
        const result = fetchedDatasets[criterion.datasetId];
        if (!result) { return false; }
        const value = result.values[code];
        if (!Number.isFinite(value)) { return false; }
        return criterion.direction === 'above'
          ? value >= criterion.absoluteThreshold
          : value <= criterion.absoluteThreshold;
      }),
    );

    return new Set(matching);
  }, [enabled, criteria, fetchedDatasets]);

  return { matchingAreas, fetchedDatasets, loading };
}

// ── Threshold utilities ────────────────────────────────────────────────────

/** Sorted finite values from a scalar result (ascending). */
export function sortedValuesFor(result: ScalarDatasetResult): number[] {
  return Object.values(result.values).filter(Number.isFinite).sort((a, b) => a - b);
}

/** Percentile rank (0–100) of `value` in `sorted` (fraction of values strictly below). */
export function percentileOf(value: number, sorted: number[]): number {
  if (sorted.length === 0) { return 0; }
  const below = sorted.filter(v => v < value).length;
  return Math.round((below / sorted.length) * 100);
}

/** Absolute value at percentile `p` (0–100) in `sorted`. */
export function valueAtPercentile(p: number, sorted: number[]): number {
  if (sorted.length === 0) { return 0; }
  const idx = Math.min(Math.round((p / 100) * (sorted.length - 1)), sorted.length - 1);
  return sorted[Math.max(0, idx)];
}
