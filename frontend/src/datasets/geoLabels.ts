/**
 * Fetch-once cache for DeSO and RegSO display labels served by the backend.
 * DeSO areas have no official names — labels are derived from the containing
 * RegSO name, with a numeric suffix when a RegSO contains multiple DeSOs.
 */

const BACKEND = '';

const cache: Partial<Record<'deso' | 'regso', Promise<Record<string, string>>>> = {};

export function getGeoLabels(level: 'deso' | 'regso'): Promise<Record<string, string>> {
  if (!cache[level]) {
    cache[level] = fetch(`${BACKEND}/api/geo-labels/${level}`)
      .then(r => {
        if (!r.ok) { throw new Error(`geo-labels ${level}: ${r.status}`); }
        return r.json() as Promise<Record<string, string>>;
      });
  }
  return cache[level]!;
}
