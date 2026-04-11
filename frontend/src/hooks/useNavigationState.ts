import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AdminLevel, SelectedFeature } from '@/datasets/types';
import type { DrillStackEntry } from '@/hooks/useMapKeyboardNavigation';
import { COUNTY_NAMES } from '@/datasets/adminLevels';
import { getMunicipalityLabels, ensureMunicipalityLabels } from '@/datasets/scb/population';

export interface NavigationState {
  selectedLevel: AdminLevel;
  setSelectedLevel: (l: AdminLevel) => void;
  selectedFeature: SelectedFeature | null;
  setSelectedFeature: (f: SelectedFeature | null) => void;
  selectionLevel: AdminLevel;
  setSelectionLevel: (l: AdminLevel) => void;
  comparisonFeature: SelectedFeature | null;
  setComparisonFeature: (f: SelectedFeature | null) => void;
  drillStack: DrillStackEntry[];
  setDrillStack: Dispatch<SetStateAction<DrillStackEntry[]>>;
  selectedLan: string | null;
  setSelectedLan: (v: string | null) => void;
  selectedMuni: string | null;
  setSelectedMuni: (v: string | null) => void;
  munLabels: Record<string, string> | null;
  pendingSelectionRef: MutableRefObject<SelectedFeature | null>;
  userDismissedPanel: MutableRefObject<boolean>;
  breadcrumbAncestors: Array<{ code: string; label: string; level: AdminLevel }>;
  handleFeatureSelect: (f: SelectedFeature | null) => void;
  handleComparisonSelect: (f: SelectedFeature | null) => void;
  handleDrillDown: (level: AdminLevel, code: string, label: string, parentCode?: string) => void;
  handleBreadcrumbGoto: (code: string, label: string, level: AdminLevel) => void;
}

/**
 * Manages the geographic navigation lifecycle: admin level, selected/comparison
 * features, drill stack, breadcrumb ancestors, and municipality labels.
 *
 * @param onSelectionChange Called when the selected feature changes so the page
 *   can open/close the selection panel without the hook knowing about UI layout.
 *   Receives the new feature (or null) and whether the user has dismissed the panel.
 * @param initialValues Optional initial state (e.g. parsed from URL search params).
 */
export function useNavigationState(
  onSelectionChange?: (feature: SelectedFeature | null, dismissed: boolean) => void,
  initialValues?: {
    selectedLevel?:     AdminLevel;
    selectedFeature?:   { code: string; label: string } | null;
    comparisonFeature?: { code: string; label: string } | null;
  },
): NavigationState {
  const initLevel = initialValues?.selectedLevel ?? 'Region';

  const [selectedLevel,     setSelectedLevel]     = useState<AdminLevel>(initLevel);
  const [selectedFeature,   setSelectedFeature]   = useState<SelectedFeature | null>(initialValues?.selectedFeature ?? null);
  const [selectionLevel,    setSelectionLevel]    = useState<AdminLevel>(initLevel);
  const [comparisonFeature, setComparisonFeature] = useState<SelectedFeature | null>(initialValues?.comparisonFeature ?? null);
  const [drillStack,        setDrillStack]        = useState<DrillStackEntry[]>([]);
  const [selectedLan,       setSelectedLan]       = useState<string | null>(null);
  const [selectedMuni,      setSelectedMuni]      = useState<string | null>(null);
  const [munLabels,         setMunLabels]         = useState<Record<string, string> | null>(() => getMunicipalityLabels());

  const pendingSelectionRef  = useRef<SelectedFeature | null>(null);
  const userDismissedPanel   = useRef(false);
  // Refs kept in sync during render so stable callbacks can read current values.
  const selectedFeatureRef   = useRef<SelectedFeature | null>(null);
  const selectedLevelRef     = useRef<AdminLevel>(initLevel);
  selectedFeatureRef.current = selectedFeature;
  selectedLevelRef.current   = selectedLevel;

  // Async-load municipality labels if not available from cache.
  useEffect(() => {
    if (munLabels) { return; }
    ensureMunicipalityLabels().then(setMunLabels).catch(() => {});
  }, [munLabels]);

  // Notify the page when the selected feature changes (for panel open/close).
  // Also clear comparison when feature is deselected.
  useEffect(() => {
    if (!selectedFeature) { setComparisonFeature(null); }
    onSelectionChange?.(selectedFeature, userDismissedPanel.current);
  }, [selectedFeature, onSelectionChange]);

  // Extract county/municipality codes from the selected feature's code prefix.
  useEffect(() => {
    if (!selectedFeature) { return; }
    if (selectedLevel === 'Municipality' || selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      setSelectedLan(selectedFeature.code.slice(0, 2));
    }
    if (selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      setSelectedMuni(selectedFeature.code.slice(0, 4));
    }
  }, [selectedFeature, selectedLevel]);

  const breadcrumbAncestors = useMemo(() => {
    if (!selectedFeature) { return []; }
    const countyCode = selectedFeature.code.slice(0, 2);
    const munCode    = selectedFeature.code.slice(0, 4);
    if (selectedLevel === 'Municipality') {
      const lbl = COUNTY_NAMES[countyCode];
      return lbl ? [{ code: countyCode, label: lbl, level: 'Region' as AdminLevel }] : [];
    }
    if (selectedLevel === 'RegSO' || selectedLevel === 'DeSO') {
      const countyLbl = COUNTY_NAMES[countyCode];
      const munLbl    = munLabels?.[munCode] ?? munCode;
      const ancestors: Array<{ code: string; label: string; level: AdminLevel }> = [];
      if (countyLbl) { ancestors.push({ code: countyCode, label: countyLbl, level: 'Region' }); }
      ancestors.push({ code: munCode, label: munLbl, level: 'Municipality' });
      return ancestors;
    }
    return [];
  }, [selectedFeature, selectedLevel, munLabels]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFeatureSelect = useCallback((feature: SelectedFeature | null) => {
    setSelectedFeature(feature);
    // Regular click exits comparison mode — shift-click is the explicit entry point.
    if (feature) { setComparisonFeature(null); }
  }, []);

  const handleComparisonSelect = useCallback((feature: SelectedFeature | null) => {
    if (!feature) { setComparisonFeature(null); return; }
    // Don't allow comparing an area with itself.
    if (feature.code === selectedFeatureRef.current?.code) { return; }
    // Toggle off if the same area is shift-clicked again.
    setComparisonFeature(prev => (prev?.code === feature.code ? null : feature));
  }, []);

  const handleDrillDown = useCallback((level: AdminLevel, code: string, label: string, parentCode?: string) => {
    const feat     = selectedFeatureRef.current;
    const currLevel = selectedLevelRef.current;
    // Push the current position onto the drill stack so we can retrace later.
    if (feat) {
      setDrillStack(s => [...s, { level: currLevel, code: feat.code, label: feat.label }]);
    }
    pendingSelectionRef.current = { code, label, parentCode };
    setSelectedLevel(level);
  }, [pendingSelectionRef]);

  /**
   * Navigate to a geographically-derived ancestor from the breadcrumb.
   * Clears the drill stack since the user is explicitly jumping up the hierarchy.
   */
  const handleBreadcrumbGoto = useCallback((code: string, label: string, level: AdminLevel) => {
    setDrillStack([]);
    pendingSelectionRef.current = { code, label };
    setSelectedLevel(level);
  }, [pendingSelectionRef]);

  return {
    selectedLevel, setSelectedLevel,
    selectedFeature, setSelectedFeature,
    selectionLevel, setSelectionLevel,
    comparisonFeature, setComparisonFeature,
    drillStack, setDrillStack,
    selectedLan, setSelectedLan,
    selectedMuni, setSelectedMuni,
    munLabels,
    pendingSelectionRef,
    userDismissedPanel,
    breadcrumbAncestors,
    handleFeatureSelect,
    handleComparisonSelect,
    handleDrillDown,
    handleBreadcrumbGoto,
  };
}
