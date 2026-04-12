/**
 * Shared helpers for the Kolada KPI API v3.
 *
 * Docs/note from research:
 *  - Base:  https://api.kolada.se/v3
 *  - CORS-enabled, no auth required
 *  - Data endpoint: GET /data/kpi/{kpi_id}/year/{year}
 *  - Municipality codes in responses are SCB 4-digit codes — no remapping needed
 *  - Gender codes: T = total, K = female, M = male
 *  - Some entries use code "0000" (national aggregate) or "G…" prefixed codes
 *    (grouped/aggregated areas) — these are filtered out.
 */

// Requests go through the Vite dev proxy (or Caddy in production) to avoid
// CORS — the Kolada v3 API does not send Access-Control-Allow-Origin headers.
// Vite:  /api/kolada/* → https://api.kolada.se/v3/*  (vite.config.ts)
// Caddy: /api/kolada/* → https://api.kolada.se/v3/*  (Caddyfile)
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
function proxyUrl(koladaUrl: string | null): string | null {
  if (!koladaUrl) { return null; }
  return koladaUrl.replace('https://api.kolada.se/v3', '/api/kolada');
}

const MUNICIPALITY_CODE_RE = /^\d{4}$/;

/**
 * Fetch the total (gender=T) value for every municipality for a given KPI and year.
 * Returns a map of 4-digit municipality code → numeric value.
 * Entries with null values or privacy-suppressed data are omitted.
 */
export async function fetchKoladaMunicipality(
  kpiId: string,
  year:  number,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  let url: string | null = `${BASE_URL}/data/kpi/${kpiId}/year/${year}?per_page=1000`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`Kolada data fetch failed (${kpiId}/${year}): ${res.status}`); }
    const page: KoladaPage = await res.json();

    for (const entry of page.values) {
      // Skip national aggregate (0000), regions, and grouped areas (G-prefix)
      if (!MUNICIPALITY_CODE_RE.test(entry.municipality) || entry.municipality === '0000') {
        continue;
      }
      const total = entry.values.find(v => v.gender === 'T');
      if (total?.value != null) {
        result[entry.municipality] = total.value;
      }
    }

    url = proxyUrl(page.next_url);
  }

  return result;
}
