import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ChartType, DatasetDescriptor, TimeSeriesNode } from '@/datasets/types';
import { fetchTimeSeriesCached } from '@/datasets/cache';

export function useTimeSeriesFetch(
  activeDescriptor: DatasetDescriptor | null,
  activeChartType:  ChartType,
  selectedLevel:    AdminLevel,
): TimeSeriesNode[] | null {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesNode[] | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (activeChartType !== 'multiline' || !activeDescriptor?.fetchTimeSeries) {
      setTimeSeriesData(null);
      return;
    }

    const gen = ++fetchGenRef.current;
    fetchTimeSeriesCached(activeDescriptor, selectedLevel)
      .then(result => {
        if (gen !== fetchGenRef.current) { return; }
        setTimeSeriesData(result);
      })
      .catch(err => console.error('Time series fetch failed:', err));
  }, [activeChartType, activeDescriptor, selectedLevel]);

  return timeSeriesData;
}
