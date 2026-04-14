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
 *
 * @param initialValues Optional initial state (e.g. parsed from URL search params).
 * @param allDatasets   Complete merged dataset list (static registry + any extras).
 *                      Defaults to the static DATASETS registry when omitted.
 */
export function useDatasetState(
  initialValues?: {
    selectedDatasetId?: string | null;
    selectedYear?:      number;
    activeParty?:       string | null;
  },
  allDatasets?: DatasetDescriptor[],
): DatasetState {
  const initYear = initialValues?.selectedYear ?? 2024;

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialValues?.selectedDatasetId ?? null);
  const [selectedYear,      setSelectedYear]       = useState<number>(initYear);
  const [displayYear,       setDisplayYear]        = useState<number>(initYear);
  const [activeParty,       setActiveParty]        = useState<string | null>(initialValues?.activeParty ?? null);

  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const datasets = useMemo(() => allDatasets ?? DATASETS, [allDatasets]);

  const activeDescriptor = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  // When dataset or year changes: clamp year to available years, clear party on non-election.
  useEffect(() => {
    if (!selectedDatasetId) { return; }
    const descriptor = datasets.find(d => d.id === selectedDatasetId);
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
  }, [datasets, selectedDatasetId, selectedYear]);

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) { clearTimeout(yearDebounceRef.current); }
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const resetDatasetForLevel = useCallback((level: AdminLevel) => {
    const available = (allDatasets ?? DATASETS).filter(d => d.supportedLevels.includes(level));
    const fallback = getDatasetsForLevel(level)[0]?.id ?? null;
    setSelectedDatasetId(id => available.some(d => d.id === id) ? id : fallback);
  }, [allDatasets]);

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
