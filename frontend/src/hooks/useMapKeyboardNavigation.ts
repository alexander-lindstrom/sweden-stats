import { useEffect, type MutableRefObject } from 'react';
import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { COUNTY_NAMES } from '@/datasets/adminLevels';

interface SelectedFeature {
  code:        string;
  label:       string;
  parentCode?: string;
}

/**
 * Handles Escape-key navigation: moves up one admin level and pre-selects
 * the parent feature where possible.
 *
 * Municipality → Region:        derive parent from first 2 digits of code.
 * RegSO → Municipality:         parent code stored in selectedFeature.parentCode.
 * DeSO → RegSO:                 navigate up without auto-selecting (no label available).
 * Region / Country → (none):    deselect current feature.
 */
export function useMapKeyboardNavigation(
  selectedFeature:    SelectedFeature | null,
  selectedLevel:      AdminLevel,
  datasetResult:      ScalarDatasetResult | null,
  setSelectedLevel:   (level: AdminLevel) => void,
  setSelectedFeature: (feature: SelectedFeature | null) => void,
  pendingSelectionRef: MutableRefObject<SelectedFeature | null>,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedFeature) { return; }

      if (selectedLevel === 'Municipality') {
        const parentCode  = selectedFeature.code.slice(0, 2);
        const parentLabel = COUNTY_NAMES[parentCode];
        if (parentLabel) { pendingSelectionRef.current = { code: parentCode, label: parentLabel }; }
        setSelectedLevel('Region');
      } else if (selectedLevel === 'RegSO') {
        const parentCode  = selectedFeature.parentCode;
        const parentLabel = parentCode ? datasetResult?.parentLabels?.[parentCode] : undefined;
        if (parentCode && parentLabel) { pendingSelectionRef.current = { code: parentCode, label: parentLabel }; }
        setSelectedLevel('Municipality');
      } else if (selectedLevel === 'DeSO') {
        setSelectedLevel('RegSO');
      } else {
        setSelectedFeature(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedFeature, selectedLevel, datasetResult, setSelectedLevel, setSelectedFeature, pendingSelectionRef]);
}
