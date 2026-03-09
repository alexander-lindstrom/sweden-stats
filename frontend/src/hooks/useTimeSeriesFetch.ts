import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ChartType, DatasetDescriptor, TimeSeriesNode } from '@/datasets/types';
import { fetchTimeSeriesCached } from '@/datasets/cache';

interface TimeSeriesFetchResult {
  data:    TimeSeriesNode[] | null;
  loading: boolean;
}

export function useTimeSeriesFetch(
  activeDescriptor: DatasetDescriptor | null,
  activeChartType:  ChartType,
  selectedLevel:    AdminLevel,
  /** When set, fetches area-specific time series instead of national aggregate. */
  featureCode?:     string | null,
): TimeSeriesFetchResult {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesNode[] | null>(null);
  const [loading,        setLoading]        = useState(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (activeChartType !== 'multiline' || !activeDescriptor?.fetchTimeSeries) {
      setTimeSeriesData(null);
      setLoading(false);
      return;
    }

    const gen = ++fetchGenRef.current;
    setLoading(true);
    fetchTimeSeriesCached(activeDescriptor, selectedLevel, featureCode ?? undefined)
      .then(result => {
        if (gen !== fetchGenRef.current) { return; }
        setTimeSeriesData(result);
        setLoading(false);
      })
      .catch(err => {
        if (gen !== fetchGenRef.current) { return; }
        console.error('Time series fetch failed:', err);
        setLoading(false);
      });
  }, [activeChartType, activeDescriptor, selectedLevel, featureCode]);

  return { data: timeSeriesData, loading };
}
