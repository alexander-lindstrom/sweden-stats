import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ElectionDatasetResult } from '@/datasets/types';
import { fetchCached } from '@/datasets/cache';
import { fetchPopulationMultiYear } from '@/datasets/scb/population';
import { DATASETS } from '@/datasets/registry';

const riksdagsvalDescriptor = DATASETS.find(d => d.id === 'riksdagsval')!;

export const SPARKLINE_YEARS  = [2000, 2004, 2008, 2012, 2016, 2020, 2024];
export const SPARKLINE_LEVELS: AdminLevel[] = ['Country', 'Region', 'Municipality'];
export const ELECTION_YEAR    = 2022;
export const ELECTION_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

export interface SparkPoint { year: number; value: number; }

/** Population every fourth year for one area. Empty outside SPARKLINE_LEVELS. */
export function usePopulationSparkline(
  feature:    { code: string } | null,
  adminLevel: AdminLevel,
): { points: SparkPoint[]; loading: boolean } {
  const [points,  setPoints]  = useState<SparkPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    const id = ++idRef.current;
    setPoints([]);
    if (!feature || !SPARKLINE_LEVELS.includes(adminLevel)) { setLoading(false); return; }
    setLoading(true);
    fetchPopulationMultiYear(adminLevel as 'Country' | 'Region' | 'Municipality', SPARKLINE_YEARS)
      .then(multiYear => {
        if (id !== idRef.current) { return; }
        setPoints(SPARKLINE_YEARS.flatMap(year => {
          const v = multiYear[year]?.[feature.code];
          return Number.isFinite(v) ? [{ year, value: v as number }] : [];
        }));
        setLoading(false);
      })
      .catch(() => { if (id === idRef.current) { setLoading(false); } });
  }, [feature, adminLevel]);

  return { points, loading };
}

/** Riksdagsval party shares for one area in ELECTION_YEAR. Null outside ELECTION_LEVELS or without data. */
export function useRiksdagsvalVotes(
  feature:    { code: string } | null,
  adminLevel: AdminLevel,
): { votes: Record<string, number> | null; loading: boolean } {
  const [votes,   setVotes]   = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    const id = ++idRef.current;
    setVotes(null);
    if (!feature || !ELECTION_LEVELS.includes(adminLevel)) { setLoading(false); return; }
    setLoading(true);
    fetchCached(riksdagsvalDescriptor, adminLevel, ELECTION_YEAR)
      .then(r => {
        if (id !== idRef.current) { return; }
        if (r.kind === 'election') {
          setVotes((r as ElectionDatasetResult).partyVotes[feature.code] ?? null);
        }
        setLoading(false);
      })
      .catch(() => { if (id === idRef.current) { setLoading(false); } });
  }, [feature, adminLevel]);

  return { votes, loading };
}
