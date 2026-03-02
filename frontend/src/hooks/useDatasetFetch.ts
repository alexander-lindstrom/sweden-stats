import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { AdminLevel, DatasetResult } from '@/datasets/types';
import { DATASETS } from '@/datasets/registry';
import { fetchCached, preload } from '@/datasets/cache';
import { ADMIN_LEVELS } from '@/datasets/adminLevels';

interface DatasetFetchResult {
  datasetResult: DatasetResult | null;
  colorScale:    d3.ScaleSequential<string> | null;
  loading:       boolean;
}

export function useDatasetFetch(
  selectedDatasetId: string | null,
  selectedLevel:     AdminLevel,
  selectedYear:      number,
): DatasetFetchResult {
  const [datasetResult, setDatasetResult] = useState<DatasetResult | null>(null);
  const [colorScale,    setColorScale]    = useState<d3.ScaleSequential<string> | null>(null);
  const [loading,       setLoading]       = useState(false);
  const fetchGenRef = useRef(0);

  // Immediately clear stale data when the level or dataset changes.
  // Year changes intentionally keep old data visible until new data arrives.
  useEffect(() => {
    setDatasetResult(null);
    setColorScale(null);
  }, [selectedDatasetId, selectedLevel]);

  useEffect(() => {
    if (!selectedDatasetId) { return; }

    const descriptor = DATASETS.find((d) => d.id === selectedDatasetId);
    if (!descriptor) { return; }

    const gen = ++fetchGenRef.current;
    setLoading(true);

    fetchCached(descriptor, selectedLevel, selectedYear)
      .then((result) => {
        if (gen !== fetchGenRef.current) { return; }

        const vals  = Object.values(result.values).filter(Number.isFinite);
        const scale = d3
          .scaleSequential(t => d3.interpolateYlOrBr(0.15 + t * 0.85))
          .domain([Math.min(...vals), Math.max(...vals)])
          .clamp(true);

        setDatasetResult(result);
        setColorScale(() => scale); // wrap: colorScale is a function type
        setLoading(false);

        // Preload neighbouring levels in the background.
        const idx        = ADMIN_LEVELS.indexOf(selectedLevel);
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

  return { datasetResult, colorScale, loading };
}
