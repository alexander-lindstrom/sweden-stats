import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminLevel, DatasetDescriptor } from '@/datasets/types';
import { DATASETS, getDatasetsForLevel } from '@/datasets/registry';

export interface DatasetState {
  selectedDatasetId: string | null;
  setSelectedDatasetId: (id: string | null) => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  displayYear: number;
  setDisplayYear: (y: number) => void;
  handleYearChange: (y: number) => void;
  activeParty: string | null;
  setActiveParty: (p: string | null) => void;
  activeDescriptor: DatasetDescriptor | null;
  /** Call when the admin level changes to keep or reset the dataset. */
  resetDatasetForLevel: (level: AdminLevel) => void;
}

/**
 * Manages dataset selection, year (with debounce), active party, and
 * the constraint effect that clamps year to available range and clears
 * the party filter when leaving election datasets.
 */
export function useDatasetState(): DatasetState {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedYear,      setSelectedYear]       = useState<number>(2024);
  const [displayYear,       setDisplayYear]        = useState<number>(2024);
  const [activeParty,       setActiveParty]        = useState<string | null>(null);

  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDescriptor = useMemo(
    () => DATASETS.find((d) => d.id === selectedDatasetId) ?? null,
    [selectedDatasetId],
  );

  // When dataset or year changes: clamp year to available years, clear party on non-election.
  useEffect(() => {
    if (!selectedDatasetId) { return; }
    const descriptor = DATASETS.find(d => d.id === selectedDatasetId);
    if (!descriptor) { return; }

    if (descriptor.availableYears.length > 0 && !descriptor.availableYears.includes(selectedYear)) {
      const nearest = descriptor.availableYears.reduce((prev, curr) =>
        Math.abs(curr - selectedYear) < Math.abs(prev - selectedYear) ? curr : prev,
      );
      setSelectedYear(nearest);
      setDisplayYear(nearest);
    }

    if (descriptor.group !== 'val') {
      setActiveParty(null);
    }
  }, [selectedDatasetId, selectedYear]);

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) { clearTimeout(yearDebounceRef.current); }
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const resetDatasetForLevel = useCallback((level: AdminLevel) => {
    const datasets = getDatasetsForLevel(level);
    setSelectedDatasetId(id => datasets.some(d => d.id === id) ? id : (datasets[0]?.id ?? null));
  }, []);

  return {
    selectedDatasetId, setSelectedDatasetId,
    selectedYear, setSelectedYear,
    displayYear, setDisplayYear,
    handleYearChange,
    activeParty, setActiveParty,
    activeDescriptor,
    resetDatasetForLevel,
  };
}
