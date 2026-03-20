/**
 * Lightweight timing store for dataset fetches.
 * Used by PerfOverlay (visible when ?perf=1) to show fetch source + duration.
 */

import { useSyncExternalStore } from 'react';

export type FetchSource = 'memory' | 'idb' | 'network';

export interface FetchTimingEntry {
  key:        string;       // "datasetId:level:year"
  source:     FetchSource;
  durationMs: number;
}

const MAX_ENTRIES = 20;
let snapshot: readonly FetchTimingEntry[] = [];
const listeners = new Set<() => void>();

function getSnapshot(): readonly FetchTimingEntry[] {
  return snapshot;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function recordFetch(entry: FetchTimingEntry): void {
  snapshot = [entry, ...snapshot].slice(0, MAX_ENTRIES);
  listeners.forEach(l => l());
}

export function useFetchTiming(): readonly FetchTimingEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
