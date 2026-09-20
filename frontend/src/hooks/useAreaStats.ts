import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { fetchCached } from '@/datasets/cache';
import { DATASETS } from '@/datasets/registry';

const popDescriptor        = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor     = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor        = DATASETS.find(d => d.id === 'medelalder')!;
const foreignBgDescriptor  = DATASETS.find(d => d.id === 'utlandsk_bakgrund')!;
const employmentDescriptor = DATASETS.find(d => d.id === 'sysselsattning')!;

const INCOME_LEVELS:     AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:        AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const FOREIGN_BG_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const EMPLOYMENT_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

export const AREA_STATS_YEAR = 2024;

export interface AreaStatsResult {
  population:  ScalarDatasetResult | null;
  income:      ScalarDatasetResult | null;
  age:         ScalarDatasetResult | null;
  foreignBg:   ScalarDatasetResult | null;
  employment:  ScalarDatasetResult | null;
  loading:     boolean;
}

/**
 * Fetches the standard set of scalar area stats (population, income, age,
 * foreign background, employment) for a single feature at the given admin level.
 * Results are batched: all stats arrive as one state update.
 */
export function useAreaStats(
  feature: { code: string; label: string } | null,
  adminLevel: AdminLevel,
  year: number = AREA_STATS_YEAR,
): AreaStatsResult {
  const [state, setState] = useState<AreaStatsResult>({
    population: null, income: null, age: null, foreignBg: null, employment: null, loading: false,
  });
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!feature) {
      setState({ population: null, income: null, age: null, foreignBg: null, employment: null, loading: false });
      return;
    }

    const id = ++fetchIdRef.current;
    setState({ population: null, income: null, age: null, foreignBg: null, employment: null, loading: true });

    let population:  ScalarDatasetResult | null = null;
    let income:      ScalarDatasetResult | null = null;
    let age:         ScalarDatasetResult | null = null;
    let foreignBg:   ScalarDatasetResult | null = null;
    let employment:  ScalarDatasetResult | null = null;

    const fetches: Promise<void>[] = [
      fetchCached(popDescriptor, adminLevel, year)
        .then(r => { if (r.kind === 'scalar') { population = r as ScalarDatasetResult; } })
        .catch(() => {}),
    ];

    if (INCOME_LEVELS.includes(adminLevel)) {
      fetches.push(
        fetchCached(incomeDescriptor, adminLevel, year)
          .then(r => { if (r.kind === 'scalar') { income = r as ScalarDatasetResult; } })
          .catch(() => {}),
      );
    }
    if (AGE_LEVELS.includes(adminLevel)) {
      fetches.push(
        fetchCached(ageDescriptor, adminLevel, year)
          .then(r => { if (r.kind === 'scalar') { age = r as ScalarDatasetResult; } })
          .catch(() => {}),
      );
    }
    if (FOREIGN_BG_LEVELS.includes(adminLevel)) {
      fetches.push(
        fetchCached(foreignBgDescriptor, adminLevel, year)
          .then(r => { if (r.kind === 'scalar') { foreignBg = r as ScalarDatasetResult; } })
          .catch(() => {}),
      );
    }
    if (EMPLOYMENT_LEVELS.includes(adminLevel)) {
      fetches.push(
        fetchCached(employmentDescriptor, adminLevel, year)
          .then(r => { if (r.kind === 'scalar') { employment = r as ScalarDatasetResult; } })
          .catch(() => {}),
      );
    }

    Promise.all(fetches).then(() => {
      if (id !== fetchIdRef.current) { return; }
      setState({ population, income, age, foreignBg, employment, loading: false });
    });
  }, [feature, adminLevel, year]);

  return state;
}

// ── Derived per-area stats (shared by the selection panel and the profile) ──

export interface StatData {
  value:      number | null;
  unit:       string;
  rank:       number | null;
  total:      number | null;
  /** Fraction of peer areas with a strictly lower value (0 = lowest, 1 = highest). */
  percentile: number | null;
}

export function toStat(result: ScalarDatasetResult, code: string): StatData {
  const value = result.values[code] ?? null;
  const all   = Object.values(result.values).filter(Number.isFinite) as number[];
  const rank  = value !== null ? all.filter(v => v > value).length + 1 : null;
  const percentile =
    value !== null && all.length > 1
      ? all.filter(v => v < value).length / (all.length - 1)
      : null;
  return { value, unit: result.unit, rank, total: all.length, percentile };
}

export interface PanelStats {
  population: StatData;
  income:     StatData | null;
  age:        StatData | null;
  foreignBg:  StatData | null;
  employment: StatData | null;
}

type AreaStatsData = Pick<AreaStatsResult, 'population' | 'income' | 'age' | 'foreignBg' | 'employment'>;

export function toPanelStats(results: AreaStatsData, code: string): PanelStats | null {
  if (!results.population) { return null; }
  return {
    population: toStat(results.population, code),
    income:     results.income     ? toStat(results.income, code)     : null,
    age:        results.age        ? toStat(results.age, code)        : null,
    foreignBg:  results.foreignBg  ? toStat(results.foreignBg, code)  : null,
    employment: results.employment ? toStat(results.employment, code) : null,
  };
}

export interface RadarAxis {
  label:      string;
  percentile: number;
  value?:     number | null;
  unit?:      string;
  rank?:      number | null;
  total?:     number | null;
}

/** Radar axes in a fixed order so two areas' polygons line up axis for axis. */
export function buildRadarAxes(stats: PanelStats | null): RadarAxis[] {
  if (!stats) { return []; }
  const entries: Array<[string, StatData | null]> = [
    ['Befolkning', stats.population],
    ['Inkomst',    stats.income],
    ['Ålder',      stats.age],
    ['Utländsk',   stats.foreignBg],
    ['Syssels.',   stats.employment],
  ];
  return entries.flatMap(([label, s]) =>
    s && s.percentile !== null
      ? [{ label, percentile: s.percentile, value: s.value, unit: s.unit, rank: s.rank, total: s.total }]
      : [],
  );
}
