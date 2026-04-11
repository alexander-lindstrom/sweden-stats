import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminLevel, ChartType, ViewType } from '@/datasets/types';
import { ADMIN_LEVELS } from '@/datasets/adminLevels';
import { DATASETS } from '@/datasets/registry';

const VALID_VIEWS:  readonly ViewType[]  = ['map', 'chart', 'table', 'profile'];
const VALID_CHARTS: readonly ChartType[] = [
  'bar', 'histogram', 'sunburst', 'diverging', 'multiline',
  'election-bar', 'party-ranking', 'scatter', 'boxplot', 'share-bar', 'donut',
];

export interface UrlInitialValues {
  selectedLevel:     AdminLevel | null;
  selectedFeature:   { code: string; label: string } | null;
  comparisonFeature: { code: string; label: string } | null;
  selectedDatasetId: string | null;
  selectedYear:      number | null;
  activeParty:       string | null;
  activeView:        ViewType | null;
  activeChartType:   ChartType | null;
}

export interface UrlSyncState {
  selectedLevel:     AdminLevel;
  selectedFeature:   { code: string; label: string } | null;
  comparisonFeature: { code: string; label: string } | null;
  selectedDatasetId: string | null;
  selectedYear:      number;
  activeParty:       string | null;
  activeView:        ViewType;
  activeChartType:   ChartType;
}

function parseInitialValues(p: URLSearchParams): UrlInitialValues {
  const rawLevel = p.get('level');
  const selectedLevel = (ADMIN_LEVELS as string[]).includes(rawLevel ?? '')
    ? rawLevel as AdminLevel
    : null;

  const rawDataset = p.get('dataset');
  const selectedDatasetId = rawDataset && DATASETS.some(d => d.id === rawDataset)
    ? rawDataset
    : null;

  const rawYear = p.get('year');
  const parsedYear = rawYear ? parseInt(rawYear, 10) : NaN;
  const selectedYear = Number.isInteger(parsedYear) && parsedYear > 1900 && parsedYear < 2100
    ? parsedYear
    : null;

  const rawView = p.get('view');
  const activeView = (VALID_VIEWS as string[]).includes(rawView ?? '')
    ? rawView as ViewType
    : null;

  const rawChart = p.get('chart');
  const activeChartType = (VALID_CHARTS as string[]).includes(rawChart ?? '')
    ? rawChart as ChartType
    : null;

  const featureCode  = p.get('feature');
  const featureLabel = p.get('featureLabel');
  const selectedFeature = featureCode && featureLabel
    ? { code: featureCode, label: featureLabel }
    : null;

  const compareCode  = p.get('compare');
  const compareLabel = p.get('compareLabel');
  const comparisonFeature = compareCode && compareLabel
    ? { code: compareCode, label: compareLabel }
    : null;

  const activeParty = p.get('party') || null;

  return {
    selectedLevel, selectedFeature, comparisonFeature,
    selectedDatasetId, selectedYear, activeParty,
    activeView, activeChartType,
  };
}

/**
 * Bridges URL search params and the three MapPage state hooks.
 *
 * - `initialValues`: parsed once from the URL at mount time; never re-reads
 *   after that so that calling `setSearchParams` cannot feed back into init.
 * - `syncUrl`: serialises the current settled state to search params.
 *   Pushes a history entry when `selectedLevel` or `selectedDatasetId` changes
 *   (enabling back-button navigation between major views); replaces for all
 *   other updates so year/feature/view changes don't pollute history.
 */
export function useUrlState(): { initialValues: UrlInitialValues; syncUrl: (state: UrlSyncState) => void } {
  // Snapshot params once at creation — never re-read from window.location.
  const initialParamsRef = useRef(new URLSearchParams(window.location.search));
  const initialValues    = useRef(parseInitialValues(initialParamsRef.current)).current;

  const [, setSearchParams] = useSearchParams();

  // Track prev level/dataset so we know when to push vs. replace.
  const prevLevelRef   = useRef<AdminLevel | null>(null);
  const prevDatasetRef = useRef<string | null>(null);

  const syncUrl = useCallback((state: UrlSyncState) => {
    const shouldPush =
      (prevLevelRef.current   !== null && prevLevelRef.current   !== state.selectedLevel) ||
      (prevDatasetRef.current !== null && prevDatasetRef.current !== state.selectedDatasetId);

    prevLevelRef.current   = state.selectedLevel;
    prevDatasetRef.current = state.selectedDatasetId;

    const params: Record<string, string> = {
      level: state.selectedLevel,
      view:  state.activeView,
    };

    if (state.selectedDatasetId) {
      params.dataset = state.selectedDatasetId;
      params.year    = String(state.selectedYear);
    }

    if (state.selectedFeature) {
      params.feature      = state.selectedFeature.code;
      params.featureLabel = state.selectedFeature.label;
    }

    if (state.comparisonFeature) {
      params.compare      = state.comparisonFeature.code;
      params.compareLabel = state.comparisonFeature.label;
    }

    if (state.activeParty) {
      params.party = state.activeParty;
    }

    // Omit chart type when it's the default to keep URLs clean.
    if (state.activeChartType !== 'bar') {
      params.chart = state.activeChartType;
    }

    setSearchParams(params, { replace: !shouldPush });
  }, [setSearchParams]);

  return { initialValues, syncUrl };
}
