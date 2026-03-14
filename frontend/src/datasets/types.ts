export type AdminLevel = 'Country' | 'Region' | 'Municipality' | 'RegSO' | 'DeSO';
export type ViewType = 'map' | 'chart' | 'table';
export type ChartType = 'bar' | 'histogram' | 'sunburst' | 'diverging' | 'multiline' | 'election-bar' | 'party-ranking' | 'scatter' | 'boxplot';

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

export type DatasetResult = ScalarDatasetResult | ElectionDatasetResult;

export interface GeoHierarchyNode {
  code: string;
  name: string;
  value: number;
  children?: GeoHierarchyNode[];
}

export interface DatasetDescriptor {
  id: string;
  label: string;
  /** Short label for use in segmented controls (e.g. inside a group). Falls back to label. */
  shortLabel?: string;
  /** Group key — datasets sharing a group are rendered as one item with a sub-selector. */
  group?: string;
  /** Display name for the group header. Only needed on one descriptor in the group. */
  groupLabel?: string;
  source: string;
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

/** Returns which views are available for a descriptor at a given level. */
export function viewsForLevel(d: DatasetDescriptor, level: AdminLevel): ViewType[] {
  return d.supportedViewsByLevel?.[level] ?? d.supportedViews;
}

/** Returns which chart types are available for a descriptor at a given level. */
export function chartTypesForLevel(d: DatasetDescriptor, level: AdminLevel): ChartType[] {
  return d.chartTypes?.[level] ?? ['bar'];
}
