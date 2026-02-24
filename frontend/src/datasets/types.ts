export type AdminLevel = 'Country' | 'Region' | 'Municipality' | 'RegSO' | 'DeSO';
export type ViewType = 'map' | 'chart' | 'table';
export type ChartType = 'bar' | 'histogram' | 'sunburst';

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar:       'Rankningslista',
  histogram: 'Fördelning',
  sunburst:  'Soldiagram',
};

export interface DatasetResult {
  values: Record<string, number>; // boundary code → value
  labels: Record<string, string>; // boundary code → display name
  label: string;                  // e.g. "Folkmängd"
  unit: string;                   // e.g. "persons"
}

export interface GeoHierarchyNode {
  code: string;
  name: string;
  value: number;
  children?: GeoHierarchyNode[];
}

export interface DatasetDescriptor {
  id: string;
  label: string;
  supportedLevels: AdminLevel[];
  supportedViews: ViewType[];
  supportedViewsByLevel?: Partial<Record<AdminLevel, ViewType[]>>;
  chartTypes?: Partial<Record<AdminLevel, ChartType[]>>;
  fetch: (level: AdminLevel) => Promise<DatasetResult>;
  fetchHierarchy?: () => Promise<GeoHierarchyNode>;
}

/** Returns which views are available for a descriptor at a given level. */
export function viewsForLevel(d: DatasetDescriptor, level: AdminLevel): ViewType[] {
  return d.supportedViewsByLevel?.[level] ?? d.supportedViews;
}

/** Returns which chart types are available for a descriptor at a given level. */
export function chartTypesForLevel(d: DatasetDescriptor, level: AdminLevel): ChartType[] {
  return d.chartTypes?.[level] ?? ['bar'];
}
