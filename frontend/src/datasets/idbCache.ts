/**
 * Persistent IndexedDB cache for DatasetResult values.
 *
 * - 30-day TTL (data is effectively static / updated at most once a year)
 * - LRU eviction when the store exceeds MAX_ENTRIES
 * - All errors are caught and ignored — private browsing, quota limits, and
 *   missing IndexedDB support should never surface to the user.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DatasetResult } from './types';

const DB_NAME     = 'sweden-data-cache';
const DB_VERSION  = 1;
const STORE_NAME  = 'results' as const;

const TTL_MS      = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_ENTRIES = 200;

interface CacheEntry {
  key:        string;
  data:       DatasetResult;
  timestamp:  number;   // when stored — used for TTL
  accessedAt: number;   // last access — used for LRU
}

interface CacheSchema extends DBSchema {
  results: {
    key:   string;
    value: CacheEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<CacheSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<CacheSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CacheSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      },
      blocked()  { dbPromise = null; },
      terminated() { dbPromise = null; },
    }).catch((err) => { dbPromise = null; throw err; });
  }
  return dbPromise;
}

export async function idbGet(key: string): Promise<DatasetResult | null> {
  try {
    const db    = await getDb();
    const entry = await db.get(STORE_NAME, key);
    if (!entry) { return null; }

    if (Date.now() - entry.timestamp > TTL_MS) {
      db.delete(STORE_NAME, key).catch(() => {});
      return null;
    }

    // Refresh accessedAt for LRU tracking (fire-and-forget).
    db.put(STORE_NAME, { ...entry, accessedAt: Date.now() }).catch(() => {});
    return entry.data;
  } catch {
    return null;
  }
}

export async function idbSet(key: string, data: DatasetResult): Promise<void> {
  try {
    const db  = await getDb();
    const now = Date.now();
    await db.put(STORE_NAME, { key, data, timestamp: now, accessedAt: now });
    await evictIfNeeded(db);
  } catch {
    // Silently ignore — private mode, quota exceeded, IDB unavailable, etc.
  }
}

export async function getIdbStats(): Promise<{ count: number; usageMb: number }> {
  try {
    const db    = await getDb();
    const count = await db.count(STORE_NAME);
    const est   = await navigator.storage.estimate();
    const usageMb = ((est.usage ?? 0) / 1024 / 1024);
    return { count, usageMb };
  } catch {
    return { count: 0, usageMb: 0 };
  }
}

async function evictIfNeeded(db: IDBPDatabase<CacheSchema>): Promise<void> {
  try {
    const all = await db.getAll(STORE_NAME);
    if (all.length <= MAX_ENTRIES) { return; }

    all.sort((a, b) => a.accessedAt - b.accessedAt);
    const toDelete = all.slice(0, all.length - MAX_ENTRIES);

    const tx = db.transaction(STORE_NAME, 'readwrite');
    await Promise.all([
      ...toDelete.map(e => tx.store.delete(e.key)),
      tx.done,
    ]);
  } catch {
    // Silently ignore.
  }
}
