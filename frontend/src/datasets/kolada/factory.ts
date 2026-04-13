import type { AdminLevel, ChartType, DatasetDescriptor } from '../types';
import { fetchKoladaScalar } from './api';

// ── KPI IDs for the five hand-coded presets ───────────────────────────────────
// Used in the browse panel to mark those KPIs as already available.
export const PRESET_KPI_IDS = new Set([
  'N00901', // kommunalskatt
  'N15507', // grundskola merit
  'N05401', // valdeltagande
  'N31807', // ekonomiskt bistand
  'N20048', // aldreomsorg
]);

// ── Descriptor config ─────────────────────────────────────────────────────────

export interface KoladaDescriptorConfig {
  id:              string;
  kpiId:           string;
  label:           string;
  unit:            string;
  availableYears:  number[];
  supportedLevels: AdminLevel[];
}

// Default year range applied when the exact available years are not known.
export const DEFAULT_KOLADA_YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i);

// ── Factory ───────────────────────────────────────────────────────────────────

export function makeKoladaDescriptor(cfg: KoladaDescriptorConfig): DatasetDescriptor {
  const levels = cfg.supportedLevels.length > 0 ? cfg.supportedLevels : (['Municipality'] as AdminLevel[]);
  const chartTypes: Partial<Record<AdminLevel, ChartType[]>> = {};
  for (const l of levels) {
    chartTypes[l] = ['bar', 'diverging', 'histogram'];
  }
  return {
    id:              cfg.id,
    label:           cfg.label,
    category:        'kolada',
    source:          'Kolada',
    availableYears:  cfg.availableYears,
    supportedLevels: levels,
    supportedViews:  ['map', 'chart', 'table'],
    chartTypes,
    fetch: (level, year) => fetchKoladaScalar(cfg.kpiId, level, year, cfg.label, cfg.unit),
  };
}
