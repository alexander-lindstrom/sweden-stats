export type AdminLevel = 'Country' | 'Region' | 'Municipality' | 'RegSO' | 'DeSO';
export type ViewType = 'map' | 'chart' | 'table';

export interface DatasetResult {
  values: Record<string, number>; // boundary code → value
  labels: Record<string, string>; // boundary code → display name
  label: string;                  // e.g. "Folkmängd"
  unit: string;                   // e.g. "persons"
}

export interface DatasetDescriptor {
  id: string;
  label: string;
  supportedLevels: AdminLevel[];
  supportedViews: ViewType[];
  supportedViewsByLevel?: Partial<Record<AdminLevel, ViewType[]>>;
  fetch: (level: AdminLevel) => Promise<DatasetResult>;
}

/** Returns which views are available for a descriptor at a given level. */
export function viewsForLevel(d: DatasetDescriptor, level: AdminLevel): ViewType[] {
  return d.supportedViewsByLevel?.[level] ?? d.supportedViews;
}
