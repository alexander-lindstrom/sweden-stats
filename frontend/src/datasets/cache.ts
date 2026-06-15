/**
 * Session-scoped cache for dataset results and hierarchy data.
 *
 * Two layers:
 *   1. resultCache   — DatasetResult keyed by "datasetId:level:year"
 *   2. hierarchyCache — GeoHierarchyNode keyed by "datasetId:year"
 *
 * In-flight deduplication: if the same key is requested while a fetch is
 * already in progress, the same Promise is returned rather than firing a
 * second network request.
 */

import { AdminLevel, DatasetDescriptor, DatasetResult, GeoHierarchyNode, TimeSeriesNode } from './types';
import { idbGet, idbSet } from './idbCache';
import { recordFetch } from './fetchTiming';

const resultCache      = new Map<string, DatasetResult>();
const hierarchyCache   = new Map<string, GeoHierarchyNode>();
const timeSeriesCache  = new Map<string, TimeSeriesNode[]>();

const resultInFlight      = new Map<string, Promise<DatasetResult>>();
const hierarchyInFlight   = new Map<string, Promise<GeoHierarchyNode>>();
const timeSeriesInFlight  = new Map<string, Promise<TimeSeriesNode[]>>();

function resultKey(datasetId: string, level: AdminLevel, year: number, breakdownId?: string): string {
  const base = `${datasetId}:${level}:${year}`;
  return breakdownId ? `${base}:${breakdownId}` : base;
}

function hierarchyKey(datasetId: string, year: number): string {
  return `${datasetId}:${year}`;
}

function timeSeriesKey(datasetId: string, level: AdminLevel, featureCode?: string, breakdownId?: string): string {
  let key = featureCode ? `${datasetId}:${level}:${featureCode}` : `${datasetId}:${level}`;
  if (breakdownId) { key += `:${breakdownId}`; }
  return key;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch a DatasetResult, using memory cache → IDB → network. */
export function fetchCached(
  descriptor: DatasetDescriptor,
  level: AdminLevel,
  year: number,
  breakdownId?: string,
): Promise<DatasetResult> {
  const key = resultKey(descriptor.id, level, year, breakdownId);
  const t0  = performance.now();

  const cached = resultCache.get(key);
  if (cached) {
    recordFetch({ key, source: 'memory', durationMs: performance.now() - t0 });
    return Promise.resolve(cached);
  }

  const inflight = resultInFlight.get(key);
  if (inflight) { return inflight; }

  const promise = idbGet(key)
    .then(async (idbResult) => {
      if (idbResult) {
        resultCache.set(key, idbResult);
        recordFetch({ key, source: 'idb', durationMs: performance.now() - t0 });
        return idbResult;
      }

      const result = await descriptor.fetch(level, year, breakdownId);
      resultCache.set(key, result);
      idbSet(key, result).catch(() => {});
      recordFetch({ key, source: 'network', durationMs: performance.now() - t0 });
      return result;
    })
    .catch(err => {
      throw err;
    })
    .finally(() => {
      resultInFlight.delete(key);
    });

  resultInFlight.set(key, promise);
  return promise;
}

/** Fetch a GeoHierarchyNode, using cache or deduplicating in-flight requests. */
export async function fetchHierarchyCached(
  descriptor: DatasetDescriptor,
  year: number,
): Promise<GeoHierarchyNode | null> {
  if (!descriptor.fetchHierarchy) {return null;}

  const key = hierarchyKey(descriptor.id, year);

  const cached = hierarchyCache.get(key);
  if (cached) {return cached;}

  const inflight = hierarchyInFlight.get(key);
  if (inflight) {return inflight;}

  const promise = descriptor
    .fetchHierarchy(year)
    .then(result => {
      hierarchyCache.set(key, result);
      hierarchyInFlight.delete(key);
      return result;
    })
    .catch(err => {
      hierarchyInFlight.delete(key);
      throw err;
    });

  hierarchyInFlight.set(key, promise);
  return promise;
}

/** Fetch a TimeSeriesNode[], using cache or deduplicating in-flight requests. */
export async function fetchTimeSeriesCached(
  descriptor: DatasetDescriptor,
  level: AdminLevel,
  featureCode?: string,
  breakdownId?: string,
): Promise<TimeSeriesNode[] | null> {
  if (!descriptor.fetchTimeSeries) { return null; }

  const key = timeSeriesKey(descriptor.id, level, featureCode, breakdownId);

  const cached = timeSeriesCache.get(key);
  if (cached) { return cached; }

  const inflight = timeSeriesInFlight.get(key);
  if (inflight) { return inflight; }

  const promise = descriptor
    .fetchTimeSeries(level, featureCode, breakdownId)
    .then(result => {
      timeSeriesCache.set(key, result);
      timeSeriesInFlight.delete(key);
      return result;
    })
    .catch(err => {
      timeSeriesInFlight.delete(key);
      throw err;
    });

  timeSeriesInFlight.set(key, promise);
  return promise;
}

/**
 * Fire-and-forget background preload for the given descriptor + levels.
 * Safe to call at any time — silently skips already-cached or in-flight keys.
 */
export function preload(descriptor: DatasetDescriptor, levels: AdminLevel[], year: number, breakdownId?: string): void {
  for (const level of levels) {
    if (!descriptor.supportedLevels.includes(level)) { continue; }
    if (descriptor.availableYears.length > 0 && !descriptor.availableYears.includes(year)) { continue; }
    const key = resultKey(descriptor.id, level, year, breakdownId);
    if (resultCache.has(key) || resultInFlight.has(key)) {continue;}
    fetchCached(descriptor, level, year, breakdownId).catch(() => { /* ignore background errors */ });
  }
}

/** True if the result for this key is already in cache (instant access). */
export function isCached(datasetId: string, level: AdminLevel, year: number, breakdownId?: string): boolean {
  return resultCache.has(resultKey(datasetId, level, year, breakdownId));
}
