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

import { AdminLevel, DatasetDescriptor, DatasetResult, GeoHierarchyNode } from './types';

const resultCache    = new Map<string, DatasetResult>();
const hierarchyCache = new Map<string, GeoHierarchyNode>();

const resultInFlight    = new Map<string, Promise<DatasetResult>>();
const hierarchyInFlight = new Map<string, Promise<GeoHierarchyNode>>();

function resultKey(datasetId: string, level: AdminLevel, year: number): string {
  return `${datasetId}:${level}:${year}`;
}

function hierarchyKey(datasetId: string, year: number): string {
  return `${datasetId}:${year}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch a DatasetResult, using cache or deduplicating in-flight requests. */
export async function fetchCached(
  descriptor: DatasetDescriptor,
  level: AdminLevel,
  year: number,
): Promise<DatasetResult> {
  const key = resultKey(descriptor.id, level, year);

  const cached = resultCache.get(key);
  if (cached) {return cached;}

  const inflight = resultInFlight.get(key);
  if (inflight) {return inflight;}

  const promise = descriptor
    .fetch(level, year)
    .then(result => {
      resultCache.set(key, result);
      resultInFlight.delete(key);
      return result;
    })
    .catch(err => {
      resultInFlight.delete(key);
      throw err;
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

/**
 * Fire-and-forget background preload for the given descriptor + levels.
 * Safe to call at any time — silently skips already-cached or in-flight keys.
 */
export function preload(descriptor: DatasetDescriptor, levels: AdminLevel[], year: number): void {
  for (const level of levels) {
    if (!descriptor.supportedLevels.includes(level)) {continue;}
    const key = resultKey(descriptor.id, level, year);
    if (resultCache.has(key) || resultInFlight.has(key)) {continue;}
    fetchCached(descriptor, level, year).catch(() => { /* ignore background errors */ });
  }
}

/** True if the result for this key is already in cache (instant access). */
export function isCached(datasetId: string, level: AdminLevel, year: number): boolean {
  return resultCache.has(resultKey(datasetId, level, year));
}
