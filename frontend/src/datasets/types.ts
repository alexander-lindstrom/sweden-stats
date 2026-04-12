export type AdminLevel = 'Country' | 'Region' | 'Municipality' | 'RegSO' | 'DeSO';
export type DatasetCategory = 'befolkning' | 'utbildning' | 'val' | 'ekonomi' | 'valfard';

export const DATASET_CATEGORY_LABELS: Record<DatasetCategory, string> = {
  befolkning: 'Befolkning',
  utbildning: 'Utbildning',
  val:        'Val',
  ekonomi:    'Ekonomi',
  valfard:    'Välfärd',
};

export const DATASET_CATEGORY_ORDER: DatasetCategory[] = [
  'befolkning', 'utbildning', 'val', 'ekonomi', 'valfard',
];
export type ViewType = 'map' | 'chart' | 'table' | 'profile';
export type ChartType = 'bar' | 'histogram' | 'sunburst' | 'diverging' | 'multiline' | 'election-bar' | 'party-ranking' | 'scatter' | 'boxplot' | 'share-bar' | 'donut';

export interface SelectedFeature {
  code:        string;
  label:       string;
  parentCode?: string;
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar:             'Rankningslista',
  histogram:       'Fördelning',
  sunburst:        'Soldiagram',
  diverging:       'Avvikelse',
  multiline:       'Tidsserie',
  'election-bar':  'Partier',
  'party-ranking': 'Rankningslista',
  scatter:         'Spridningsdiagram',
  boxplot:         'Lådagram',
  'share-bar':     'Könsfördelning',
  donut:           'Cirkeldiagram',
};

export interface TimeSeriesPoint {
  date: string;   // ISO date: YYYY-MM-DD
  value: number;
}

export interface TimeSeriesNode {
  id: string;
  label: string;
  points: TimeSeriesPoint[];
}

export interface CategoryShare {
  code:         string;
  label:        string;        // shown in legend
  tooltipLabel?: string;       // shown in hover tooltip; falls back to label
  color:        string;
}

export interface CategoricalShareResult {
  kind:       'categorical-share';
  /** Ordered segment definitions — one per stacked column (e.g. [{men}, {women}]). */
  categories: CategoryShare[];
  /** One row per item (e.g. field of study). shares values should sum to ~100 per row. */
  rows: Array<{
    code:   string;
    label:  string;
    shares: Record<string, number>; // categoryCode → share %
  }>;
  label: string;
  unit:  string;
}

export interface ScalarDatasetResult {
  kind: 'scalar';
  values: Record<string, number>; // boundary code → value
  labels: Record<string, string>; // boundary code → display name
  label: string;                  // e.g. "Folkmängd"
  unit: string;                   // e.g. "persons"
  /** Parent-level labels (municipality code → name) included at RegSO/DeSO levels. */
  parentLabels?: Record<string, string>;
}

export interface ElectionDatasetResult {
  kind: 'election';
  /** geoCode → { partyCode → vote share 0–100 } */
  partyVotes:  Record<string, Record<string, number>>;
  /** geoCode → winning party code */
  winnerByGeo: Record<string, string>;
  /** geoCode → display name */
  labels:      Record<string, string>;
  label:       string;
  unit:        string;
  electionType: 'riksdag' | 'region' | 'municipality';
}

export interface DonutDatasetResult {
  kind:  'donut';
  items: { code: string; label: string; value: number; color: string }[];
  label: string;
  unit:  string;
}

export type DatasetResult = ScalarDatasetResult | ElectionDatasetResult | CategoricalShareResult | DonutDatasetResult;

export interface GeoHierarchyNode {
  code: string;
  name: string;
  value: number;
  children?: GeoHierarchyNode[];
}

export interface DatasetDescriptor {
  id: string;
  label: string;
  category?: DatasetCategory;
  /** Short label for use in segmented controls (e.g. inside a group). Falls back to label. */
  shortLabel?: string;
  /** Group key — datasets sharing a group are rendered as one item with a sub-selector. */
  group?: string;
  /** Display name for the group header. Only needed on one descriptor in the group. */
  groupLabel?: string;
  source: string;
  /** Unit label shown on time series charts (e.g. 'poäng', '%'). */
  timeSeriesUnit?: string;
  /** Y-axis label for time series charts. Defaults to descriptor label when absent. */
  timeSeriesLabel?: string;
  /** Color overrides for time series lines (id → hex color). */
  lineColors?: Record<string, string>;
  /** When set, builds a diverging colour scale centred on divergingCenter instead of the default sequential scale. */
  colorScaleType?:  'diverging';
  divergingCenter?: number;
  availableYears: number[];
  supportedLevels: AdminLevel[];
  supportedViews: ViewType[];
  supportedViewsByLevel?: Partial<Record<AdminLevel, ViewType[]>>;
  chartTypes?: Partial<Record<AdminLevel, ChartType[]>>;
  /** Maps sunburst drill depth to AdminLevel for geographic navigation.
   *  Omit for non-geographic datasets (e.g. state expenses). */
  sunburstDepthToLevel?: AdminLevel[];
  fetch: (level: AdminLevel, year: number) => Promise<DatasetResult>;
  fetchHierarchy?: (year: number) => Promise<GeoHierarchyNode>;
  /** Pass featureCode to get area-specific time series (e.g. a county or municipality).
   *  Omit for national/global aggregate. */
  fetchTimeSeries?: (level: AdminLevel, featureCode?: string) => Promise<TimeSeriesNode[]>;
}

export interface FilterCriterion {
  datasetId: string;
  /** Absolute threshold value. NaN = not yet set (criterion is inactive — no filtering). */
  absoluteThreshold: number;
  direction: 'above' | 'below';
}

/** Returns which views are available for a descriptor at a given level. */
export function viewsForLevel(d: DatasetDescriptor, level: AdminLevel): ViewType[] {
  return d.supportedViewsByLevel?.[level] ?? d.supportedViews;
}

/** Returns which chart types are available for a descriptor at a given level. */
export function chartTypesForLevel(d: DatasetDescriptor, level: AdminLevel): ChartType[] {
  return d.chartTypes?.[level] ?? ['bar'];
}
