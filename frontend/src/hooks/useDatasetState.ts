import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminLevel, DatasetDescriptor } from '@/datasets/types';
import { DATASETS, getDatasetsForLevel } from '@/datasets/registry';

function mergeDatasets(extra?: DatasetDescriptor[]): DatasetDescriptor[] {
  return extra && extra.length > 0 ? [...DATASETS, ...extra] : DATASETS;
}

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
 * @param extraDatasets  Additional descriptors beyond the static registry (e.g. pinned Kolada KPIs).
 */
export function useDatasetState(
  initialValues?: {
    selectedDatasetId?: string | null;
    selectedYear?:      number;
    activeParty?:       string | null;
  },
  extraDatasets?: DatasetDescriptor[],
): DatasetState {
  const initYear = initialValues?.selectedYear ?? 2024;

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialValues?.selectedDatasetId ?? null);
  const [selectedYear,      setSelectedYear]       = useState<number>(initYear);
  const [displayYear,       setDisplayYear]        = useState<number>(initYear);
  const [activeParty,       setActiveParty]        = useState<string | null>(initialValues?.activeParty ?? null);

  const yearDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allDatasets = useMemo(() => mergeDatasets(extraDatasets), [extraDatasets]);

  const activeDescriptor = useMemo(
    () => allDatasets.find((d) => d.id === selectedDatasetId) ?? null,
    [allDatasets, selectedDatasetId],
  );

  // When dataset or year changes: clamp year to available years, clear party on non-election.
  useEffect(() => {
    if (!selectedDatasetId) { return; }
    const descriptor = allDatasets.find(d => d.id === selectedDatasetId);
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
  }, [allDatasets, selectedDatasetId, selectedYear]);

  const handleYearChange = (y: number) => {
    setDisplayYear(y);
    if (yearDebounceRef.current) { clearTimeout(yearDebounceRef.current); }
    yearDebounceRef.current = setTimeout(() => setSelectedYear(y), 350);
  };

  const resetDatasetForLevel = useCallback((level: AdminLevel) => {
    const base = getDatasetsForLevel(level);
    const extra = (extraDatasets ?? []).filter(d => d.supportedLevels.includes(level));
    const all = [...base, ...extra];
    setSelectedDatasetId(id => all.some(d => d.id === id) ? id : (base[0]?.id ?? null));
  }, [extraDatasets]);

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
