import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { AdminLevel, DatasetResult, ScalarDatasetResult } from '@/datasets/types';
import { DATASETS } from '@/datasets/registry';
import { fetchCached, preload } from '@/datasets/cache';
import { ADMIN_LEVELS } from '@/datasets/adminLevels';
import { PARTY_COLORS } from '@/datasets/parties';

interface DatasetFetchResult {
  datasetResult: DatasetResult | null;
  colorScale:    d3.ScaleSequential<string> | null;
  /** Non-null for election datasets in winner mode: maps geo code → winning party color. */
  mapColorFn:    ((code: string) => string) | null;
  loading:       boolean;
}

export function useDatasetFetch(
  selectedDatasetId: string | null,
  selectedLevel:     AdminLevel,
  selectedYear:      number,
  /** When set, switches election map from winner-color to a per-party gradient choropleth. */
  activeParty?:      string | null,
): DatasetFetchResult {
  const [datasetResult, setDatasetResult] = useState<DatasetResult | null>(null);
  const [colorScale,    setColorScale]    = useState<d3.ScaleSequential<string> | null>(null);
  const [mapColorFn,    setMapColorFn]    = useState<((code: string) => string) | null>(null);
  const [loading,       setLoading]       = useState(false);
  const fetchGenRef = useRef(0);

  // Immediately clear stale data when the level or dataset changes.
  // Year changes intentionally keep old data visible until new data arrives.
  useEffect(() => {
    setDatasetResult(null);
    setColorScale(null);
    setMapColorFn(null);
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

        setDatasetResult(result);

        if (result.kind === 'election') {
          if (activeParty) {
            // Party choropleth mode: build a gradient from white → party color.
            const partyColor = PARTY_COLORS[activeParty] ?? '#888';
            const shares = Object.values(result.partyVotes)
              .map(v => v[activeParty] ?? 0)
              .filter(Number.isFinite);
            const maxShare = shares.length > 0 ? Math.max(...shares) : 50;
            const scale = d3
              .scaleSequential((t: number) => d3.interpolate('#f1f5f9', partyColor)(t))
              .domain([0, maxShare])
              .clamp(true);
            setColorScale(() => scale);
            setMapColorFn(null);
          } else {
            // Winner mode: color each area by the winning party.
            const winnerByGeo = result.winnerByGeo;
            setColorScale(null);
            setMapColorFn(() => (code: string) => PARTY_COLORS[winnerByGeo[code]] ?? '#ccc');
          }
        } else {
          // Scalar: sequential color scale.
          const vals = Object.values((result as ScalarDatasetResult).values).filter(Number.isFinite);
          setMapColorFn(null);
          if (vals.length > 0) {
            const scale = d3
              .scaleSequential(t => d3.interpolateYlOrBr(0.15 + t * 0.85))
              .domain([Math.min(...vals), Math.max(...vals)])
              .clamp(true);
            setColorScale(() => scale);
          } else {
            setColorScale(null);
          }
        }

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
  }, [selectedDatasetId, selectedLevel, selectedYear, activeParty]);

  return { datasetResult, colorScale, mapColorFn, loading };
}
