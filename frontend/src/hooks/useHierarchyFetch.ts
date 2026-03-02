import { useEffect, useRef, useState } from 'react';
import type { ChartType, DatasetDescriptor, GeoHierarchyNode } from '@/datasets/types';
import { fetchHierarchyCached } from '@/datasets/cache';

export function useHierarchyFetch(
  activeDescriptor: DatasetDescriptor | null,
  activeChartType:  ChartType,
  selectedYear:     number,
): GeoHierarchyNode | null {
  const [hierarchyData, setHierarchyData] = useState<GeoHierarchyNode | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (activeChartType !== 'sunburst' || !activeDescriptor?.fetchHierarchy) {
      setHierarchyData(null);
      return;
    }

    const gen = ++fetchGenRef.current;
    fetchHierarchyCached(activeDescriptor, selectedYear)
      .then(result => {
        if (gen !== fetchGenRef.current) { return; }
        setHierarchyData(result);
      })
      .catch(err => console.error('Hierarchy fetch failed:', err));
  }, [activeChartType, activeDescriptor, selectedYear]);

  return hierarchyData;
}
