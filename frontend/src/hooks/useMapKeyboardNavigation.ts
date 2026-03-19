import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { COUNTY_NAMES } from '@/datasets/adminLevels';

interface SelectedFeature {
  code:        string;
  label:       string;
  parentCode?: string;
}

export interface DrillStackEntry {
  level: AdminLevel;
  code:  string;
  label: string;
}

/**
 * Handles Escape-key navigation: moves up one admin level.
 *
 * If a drill stack is present (built by double-click drill-downs), the top entry
 * is popped and the user is taken back to that level with that feature selected.
 *
 * When the stack is empty, falls back to code-prefix derivation:
 *   Municipality → Region:        derive parent from first 2 digits of code.
 *   RegSO → Municipality:         parent code stored in selectedFeature.parentCode.
 *   DeSO → RegSO:                 navigate up without auto-selecting (no label available).
 *   Region / Country → (none):    deselect current feature.
 */
export function useMapKeyboardNavigation(
  selectedFeature:    SelectedFeature | null,
  selectedLevel:      AdminLevel,
  datasetResult:      ScalarDatasetResult | null,
  setSelectedLevel:   (level: AdminLevel) => void,
  setSelectedFeature: (feature: SelectedFeature | null) => void,
  pendingSelectionRef: MutableRefObject<SelectedFeature | null>,
  drillStack:         DrillStackEntry[],
  setDrillStack:      Dispatch<SetStateAction<DrillStackEntry[]>>,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedFeature) { return; }

      // If we drilled down via double-click, pop the stack to retrace the path.
      if (drillStack.length > 0) {
        const top = drillStack[drillStack.length - 1];
        setDrillStack(s => s.slice(0, -1));
        pendingSelectionRef.current = { code: top.code, label: top.label };
        setSelectedLevel(top.level);
        return;
      }

      // Fallback: no drill history — navigate by code prefix.
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
  }, [selectedFeature, selectedLevel, datasetResult, setSelectedLevel, setSelectedFeature, pendingSelectionRef, drillStack, setDrillStack]);
}
