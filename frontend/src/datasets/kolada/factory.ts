import type { AdminLevel, ChartType, DatasetDescriptor } from '../types';
import type { KoladaKpiMeta } from './api';
import { fetchKoladaScalar } from './api';

// ── Unit string helpers ───────────────────────────────────────────────────────
// Kolada KPI titles often encode the unit in a trailing parenthetical, e.g.
// "Skattesats till kommun (%)". However many titles also have descriptive
// parentheticals like "(åk 9)" or "(hemkommun)" that are NOT units.
// We only extract the parenthetical when it matches a known measurement pattern;
// otherwise we leave the title untouched and return an empty unit string.

const UNIT_RE = /^(%|kr|tkr|mnkr|antal|poäng|index|tim|dagar|kr\/inv(?:\s+\d+\+)?|per\s+[\d\s]+inv(?:\s*\d+\+)?)$/i;

/** Extract the measurement unit from a trailing parenthetical, or '' if not recognised. */
export function extractUnit(title: string): string {
  const match = title.match(/\(([^)]+)\)$/);
  if (!match) { return ''; }
  const candidate = match[1].trim();
  return UNIT_RE.test(candidate) ? candidate : '';
}

/** Strip the trailing unit parenthetical from the title (only when extractUnit returns non-empty). */
export function stripUnit(title: string): string {
  return extractUnit(title) ? title.replace(/\s*\([^)]+\)$/, '').trim() : title.trim();
}

// ── Level mapping ─────────────────────────────────────────────────────────────

/** Map Kolada municipality_type to the admin levels that have data for this KPI. */
export function municipalityTypeToLevels(municipalityType: string): AdminLevel[] {
  if (municipalityType === 'L') { return ['Region']; }
  if (municipalityType === 'A') { return ['Region', 'Municipality']; }
  return ['Municipality']; // 'K' and anything else
}

// ── Descriptor config ─────────────────────────────────────────────────────────

export interface KoladaDescriptorConfig {
  id:              string;
  kpiId:           string;
  label:           string;
  unit:            string;
  availableYears:  number[];
  supportedLevels: AdminLevel[];
}

// Default year range applied when exact available years are not known (pinned KPIs
// from the catalog). Kolada metadata does not expose a year range, so we use a wide
// window — some years will return empty data silently, which is benign.
export const DEFAULT_KOLADA_YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i);

// ── Config builder from catalog metadata ──────────────────────────────────────

/** Build a KoladaDescriptorConfig from raw KPI catalog metadata. */
export function makeKoladaDescriptorFromMeta(kpi: KoladaKpiMeta): KoladaDescriptorConfig {
  return {
    id:              `kolada-${kpi.id}`,
    kpiId:           kpi.id,
    label:           stripUnit(kpi.title),
    unit:            extractUnit(kpi.title),
    availableYears:  DEFAULT_KOLADA_YEARS,
    supportedLevels: municipalityTypeToLevels(kpi.municipality_type),
  };
}

// ── Descriptor factory ────────────────────────────────────────────────────────

export function makeKoladaDescriptor(cfg: KoladaDescriptorConfig): DatasetDescriptor {
  const levels = cfg.supportedLevels.length > 0 ? cfg.supportedLevels : (['Municipality'] as AdminLevel[]);
  const chartTypes: Partial<Record<AdminLevel, ChartType[]>> = {};
  for (const l of levels) {
    chartTypes[l] = ['bar', 'diverging', 'histogram'];
  }
  return {
    id:              cfg.id,
    kpiId:           cfg.kpiId,
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
