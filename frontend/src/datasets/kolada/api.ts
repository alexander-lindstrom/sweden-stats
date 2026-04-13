/**
 * Shared helpers for the Kolada KPI API v3.
 *
 * Docs/note from research:
 *  - Base:  https://api.kolada.se/v3
 *  - Data endpoint: GET /data/kpi/{kpi_id}/year/{year}
 *  - Municipality codes in responses are SCB 4-digit codes — no remapping needed
 *  - Region codes in responses are "00XX" (e.g. "0001" for Stockholm).
 *    Strip the leading "00" to get the SCB 2-digit county code used by the map.
 *  - Gender codes: T = total, K = female, M = male
 *  - KPI metadata field municipality_type: "K" = municipality only, "A" = all (K + L regions)
 *  - Some entries use code "0000" (national aggregate) or "G…" prefixed codes
 *    (grouped/aggregated areas) — these are filtered out.
 */

// Requests go through the Vite dev proxy (or Caddy in production) to avoid
// CORS — the Kolada v3 API does not send Access-Control-Allow-Origin headers.
// Vite:  /api/kolada/* → https://api.kolada.se/v3/*  (vite.config.ts)
// Caddy: /api/kolada/* → https://api.kolada.se/v3/*  (Caddyfile)
import { COUNTY_NAMES } from '../adminLevels';
import type { AdminLevel, ScalarDatasetResult } from '../types';

const BASE_URL = '/api/kolada';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KoladaValue {
  gender: 'T' | 'K' | 'M';
  count:  number;
  status: string;
  value:  number | null;
  isdeleted: boolean;
}

interface KoladaEntry {
  kpi:          string;
  municipality: string;
  period:       number;
  values:       KoladaValue[];
}

interface KoladaPage {
  values:       KoladaEntry[];
  count:        number;
  next_url:     string | null;
  previous_url: string | null;
}

interface KoladaMunicipality {
  id:    string;
  title: string;
  type:  'K' | 'L' | string;
}

interface KoladaMunicipalityPage {
  values:       KoladaMunicipality[];
  count:        number;
  next_url:     string | null;
  previous_url: string | null;
}

// ── Municipality label cache ───────────────────────────────────────────────────

let municipalityLabelCache: Promise<Record<string, string>> | null = null;

export function getKoladaMunicipalityLabels(): Promise<Record<string, string>> {
  if (!municipalityLabelCache) {
    municipalityLabelCache = fetchAllMunicipalityLabels();
  }
  return municipalityLabelCache;
}

async function fetchAllMunicipalityLabels(): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  let url: string | null = `${BASE_URL}/municipality?per_page=500`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`Kolada municipality fetch failed: ${res.status}`); }
    const page: KoladaMunicipalityPage = await res.json();
    for (const m of page.values) {
      if (m.type === 'K') {
        labels[m.id] = m.title;
      }
    }
    url = proxyUrl(page.next_url);
  }

  return labels;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

// Kolada's next_url values are absolute (https://api.kolada.se/v3/...).
// Rewrite them to go through the proxy so the browser never calls Kolada directly.
// Strip any hostname — Kolada may reflect X-Forwarded-Host (e.g. our own domain)
// rather than its own, so we match on the /v3 path prefix only.
function proxyUrl(koladaUrl: string | null): string | null {
  if (!koladaUrl) { return null; }
  return koladaUrl.replace(/^https?:\/\/[^/]+\/v3/, '/api/kolada');
}

// Matches valid 4-digit SCB municipality codes (0114–2584), excluding regions (00XX) and national (0000).
const MUNICIPALITY_CODE_RE = /^(?!00)\d{4}$/;

// Matches Kolada region codes: 00XX where XX is the 2-digit SCB county code.
const REGION_CODE_RE = /^00(0[1-9]|1[0-9]|2[0-5])$/;

// Per-(kpiId, year, variant) promise cache so repeat visits don't re-fetch.
const dataCache = new Map<string, Promise<Record<string, number>>>();

/**
 * Shared pagination loop. `accept` maps a municipality code to a result key,
 * or returns null to skip the entry.
 */
async function fetchKoladaKpiData(
  kpiId: string,
  year: number,
  accept: (code: string) => string | null,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  let url: string | null = `${BASE_URL}/data/kpi/${kpiId}/year/${year}?per_page=1000`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`Kolada data fetch failed (${kpiId}/${year}): ${res.status}`); }
    const page: KoladaPage = await res.json();

    for (const entry of page.values) {
      const key = accept(entry.municipality);
      if (key === null) { continue; }
      const total = entry.values.find(v => v.gender === 'T');
      if (total?.value != null) {
        result[key] = total.value;
      }
    }

    url = proxyUrl(page.next_url);
  }

  return result;
}

/**
 * Fetch the total (gender=T) value for every region for a given KPI and year.
 * Returns a map of SCB 2-digit county code → numeric value (e.g. "01" → 3.2).
 * Only works for KPIs with municipality_type "A".
 */
export function fetchKoladaRegion(kpiId: string, year: number): Promise<Record<string, number>> {
  const key = `region:${kpiId}:${year}`;
  if (!dataCache.has(key)) {
    dataCache.set(key, fetchKoladaKpiData(kpiId, year, code =>
      REGION_CODE_RE.test(code) ? code.slice(2) : null,
    ));
  }
  return dataCache.get(key)!;
}

/** Region labels: reuse COUNTY_NAMES for consistency with the rest of the app. */
export function getKoladaRegionLabels(): Record<string, string> {
  return COUNTY_NAMES;
}

/**
 * Fetch the total (gender=T) value for every municipality for a given KPI and year.
 * Returns a map of 4-digit municipality code → numeric value.
 * Entries with null values or privacy-suppressed data are omitted.
 */
export function fetchKoladaMunicipality(kpiId: string, year: number): Promise<Record<string, number>> {
  const key = `municipality:${kpiId}:${year}`;
  if (!dataCache.has(key)) {
    dataCache.set(key, fetchKoladaKpiData(kpiId, year, code =>
      MUNICIPALITY_CODE_RE.test(code) ? code : null,
    ));
  }
  return dataCache.get(key)!;
}

/**
 * Fetch a scalar KPI result for any supported admin level.
 * Handles Region vs Municipality dispatch and label resolution.
 */
export async function fetchKoladaScalar(
  kpiId: string,
  level: AdminLevel,
  year: number,
  label: string,
  unit: string,
): Promise<ScalarDatasetResult> {
  if (level === 'Region') {
    const values = await fetchKoladaRegion(kpiId, year);
    return { kind: 'scalar', values, labels: getKoladaRegionLabels(), label, unit };
  }
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(kpiId, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label, unit };
}
