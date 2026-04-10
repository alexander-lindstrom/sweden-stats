import { useEffect, useMemo, useState } from 'react';
import type { AdminLevel, ChartType, DatasetDescriptor, ViewType } from '@/datasets/types';
import { chartTypesForLevel, viewsForLevel } from '@/datasets/types';
import { DATASETS } from '@/datasets/registry';

export interface ViewState {
  activeView: ViewType;
  setActiveView: (v: ViewType) => void;
  activeChartType: ChartType;
  setActiveChartType: (ct: ChartType) => void;
  availableViews: ViewType[];
  availableChartTypes: ChartType[];
  // Bivariate
  bivariateMode: boolean;
  setBivariateMode: (m: boolean | ((prev: boolean) => boolean)) => void;
  bivariateYDatasetId: string | null;
  setBivariateYDatasetId: (id: string | null) => void;
  bivariateDatasets: DatasetDescriptor[];
  bivariateYDescriptor: DatasetDescriptor | null;
  // Scatter
  scatterYDatasetId: string | null;
  setScatterYDatasetId: (id: string | null) => void;
  scatterableDatasets: DatasetDescriptor[];
}

/**
 * Manages the active view/chart type and bivariate/scatter mode selection.
 *
 * @param selectedLevel Current admin level.
 * @param selectedDatasetId Currently active dataset id.
 * @param activeDescriptor Descriptor for the active dataset.
 * @param onElectionDataset Called when the active dataset switches to an election
 *   dataset, so MapPage can clear filter state that is incompatible with elections.
 */
export function useViewState(
  selectedLevel: AdminLevel,
  selectedDatasetId: string | null,
  activeDescriptor: DatasetDescriptor | null,
  onElectionDataset?: () => void,
): ViewState {
  const [activeView,          setActiveView]          = useState<ViewType>('map');
  const [activeChartType,     setActiveChartType]     = useState<ChartType>('bar');
  const [bivariateMode,       setBivariateMode]       = useState(false);
  const [bivariateYDatasetId, setBivariateYDatasetId] = useState<string | null>(null);
  const [scatterYDatasetId,   setScatterYDatasetId]   = useState<string | null>(null);

  const availableViews = useMemo(
    () => activeDescriptor ? viewsForLevel(activeDescriptor, selectedLevel) : ['map' as ViewType],
    [activeDescriptor, selectedLevel],
  );

  const availableChartTypes = useMemo(
    () => activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType],
    [activeDescriptor, selectedLevel],
  );

  // Scalar geographic datasets available as the scatter Y axis (excludes active + elections).
  const scatterableDatasets = useMemo(
    () => DATASETS.filter(d =>
      d.id !== selectedDatasetId &&
      d.group !== 'val' &&
      d.supportedLevels.includes(selectedLevel) &&
      chartTypesForLevel(d, selectedLevel).some(ct => ['bar', 'diverging', 'histogram', 'scatter'].includes(ct)),
    ),
    [selectedDatasetId, selectedLevel],
  );

  // Scalar datasets available as the bivariate Y axis (excludes active dataset + elections).
  const bivariateDatasets = useMemo(
    () => DATASETS.filter(d =>
      d.id !== selectedDatasetId &&
      d.group !== 'val' &&
      d.supportedLevels.includes(selectedLevel),
    ),
    [selectedDatasetId, selectedLevel],
  );

  const bivariateYDescriptor = useMemo(
    () => DATASETS.find(d => d.id === bivariateYDatasetId) ?? null,
    [bivariateYDatasetId],
  );

  // Snap activeView if it becomes unavailable at the new level/dataset.
  useEffect(() => {
    if ((activeView === 'profile' && selectedLevel === 'Country') || (activeView !== 'profile' && !availableViews.includes(activeView))) {
      setActiveView(availableViews[0] ?? 'map');
    }
  }, [availableViews, activeView]);

  // Snap activeChartType if it becomes unavailable.
  useEffect(() => {
    const types = activeDescriptor ? chartTypesForLevel(activeDescriptor, selectedLevel) : ['bar' as ChartType];
    setActiveChartType(ct => types.includes(ct) ? ct : (types[0] ?? 'bar'));
  }, [selectedLevel, activeDescriptor]);

  // Auto-select the first available scatter Y dataset when entering scatter mode.
  useEffect(() => {
    if (activeChartType !== 'scatter') { return; }
    const valid = scatterableDatasets.some(d => d.id === scatterYDatasetId);
    if (!valid) {
      setScatterYDatasetId(scatterableDatasets[0]?.id ?? null);
    }
  }, [activeChartType, scatterableDatasets, scatterYDatasetId]);

  // Deactivate bivariate mode when leaving map view.
  useEffect(() => {
    if (activeView !== 'map') { setBivariateMode(false); }
  }, [activeView]);

  // Deactivate bivariate mode when switching to an election dataset.
  useEffect(() => {
    if (activeDescriptor?.group === 'val') {
      setBivariateMode(false);
      onElectionDataset?.();
    }
  }, [activeDescriptor, onElectionDataset]);

  // Auto-select a bivariate Y dataset when entering bivariate mode.
  useEffect(() => {
    if (!bivariateMode) { return; }
    const valid = bivariateDatasets.some(d => d.id === bivariateYDatasetId);
    if (!valid) {
      setBivariateYDatasetId(bivariateDatasets[0]?.id ?? null);
    }
  }, [bivariateMode, bivariateDatasets, bivariateYDatasetId]);

  return {
    activeView, setActiveView,
    activeChartType, setActiveChartType,
    availableViews,
    availableChartTypes,
    bivariateMode, setBivariateMode,
    bivariateYDatasetId, setBivariateYDatasetId,
    bivariateDatasets,
    bivariateYDescriptor,
    scatterYDatasetId, setScatterYDatasetId,
    scatterableDatasets,
  };
}
