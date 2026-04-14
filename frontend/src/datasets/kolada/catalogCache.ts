/**
 * Persistent cache for the full Kolada KPI catalog (~4 500 items).
 *
 * Load order:
 *   1. Module-level promise (already in-flight or resolved this session)
 *   2. IDB store 'kolada-catalog' with 7-day TTL
 *   3. Full paginated fetch from the Kolada API
 */

import { openDB } from 'idb';
import type { KoladaKpiMeta } from './api';
import { fetchAllKoladaKpis } from './api';

const DB_NAME    = 'kolada-catalog';
const DB_VERSION = 1;
const STORE_NAME = 'catalog';
const CACHE_KEY  = 'all-kpis';
const TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CatalogEntry {
  data:      KoladaKpiMeta[];
  timestamp: number;
}

// ── IDB helpers ───────────────────────────────────────────────────────────────

async function idbLoad(): Promise<KoladaKpiMeta[] | null> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(d) { d.createObjectStore(STORE_NAME); },
    });
    const entry: CatalogEntry | undefined = await db.get(STORE_NAME, CACHE_KEY);
    if (entry && Date.now() - entry.timestamp < TTL_MS) {
      return entry.data;
    }
  } catch { /* IDB unavailable (private mode, quota, etc.) */ }
  return null;
}

async function idbSave(kpis: KoladaKpiMeta[]): Promise<void> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(d) { d.createObjectStore(STORE_NAME); },
    });
    const entry: CatalogEntry = { data: kpis, timestamp: Date.now() };
    await db.put(STORE_NAME, entry, CACHE_KEY);
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Module-level deduplication: concurrent callers share one promise per session.
let catalogPromise: Promise<KoladaKpiMeta[]> | null = null;

export function getKoladaKpiCatalog(): Promise<KoladaKpiMeta[]> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog().catch(err => {
      catalogPromise = null; // reset so next call retries
      throw err;
    });
  }
  return catalogPromise;
}

async function loadCatalog(): Promise<KoladaKpiMeta[]> {
  const cached = await idbLoad();
  if (cached) { return cached; }

  const kpis = await fetchAllKoladaKpis();
  await idbSave(kpis);
  return kpis;
}
