import { useEffect, useRef, useState } from 'react';
import type { ChartType, DatasetDescriptor, GeoHierarchyNode } from '@/datasets/types';
import { fetchHierarchyCached } from '@/datasets/cache';

interface HierarchyFetchResult {
  data:    GeoHierarchyNode | null;
  loading: boolean;
}

export function useHierarchyFetch(
  activeDescriptor: DatasetDescriptor | null,
  activeChartType:  ChartType,
  selectedYear:     number,
): HierarchyFetchResult {
  const [hierarchyData, setHierarchyData] = useState<GeoHierarchyNode | null>(null);
  const [loading,       setLoading]       = useState(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (activeChartType !== 'sunburst' || !activeDescriptor?.fetchHierarchy) {
      setHierarchyData(null);
      setLoading(false);
      return;
    }

    const gen = ++fetchGenRef.current;
    setLoading(true);
    fetchHierarchyCached(activeDescriptor, selectedYear)
      .then(result => {
        if (gen !== fetchGenRef.current) { return; }
        setHierarchyData(result);
        setLoading(false);
      })
      .catch(err => {
        if (gen !== fetchGenRef.current) { return; }
        console.error('Hierarchy fetch failed:', err);
        setLoading(false);
      });
  }, [activeChartType, activeDescriptor, selectedYear]);

  return { data: hierarchyData, loading };
}
