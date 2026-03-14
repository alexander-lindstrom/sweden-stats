import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { getGeoLabels } from '../geoLabels';
import { stripCodePrefix } from '@/utils/labelFormatting';

// ── TAB6571 constants ─────────────────────────────────────────────────────────
// "Folkmängden per region efter utländsk/svensk bakgrund och kön. År 2010–2024"
// Covers all admin levels: county (2-digit), municipality (4-digit),
// RegSO (_RegSO2025 suffix), DeSO (_DeSO2025 suffix).
// Request UtlBakgrund=[1, SA] to get foreign-background count and total,
// then compute percentage per region.

const DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6571/data?outputFormat=json-stat2';

const METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6571/metadata';

// ── Shared types ──────────────────────────────────────────────────────────────

interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

// ── Code cache ────────────────────────────────────────────────────────────────

interface CodeCache {
  countyCodes:        string[];
  municipalityCodes:  string[];
  regsoCodes:         string[];
  desoCodes:          string[];
  municipalityLabels: Record<string, string>;
}

let codeCache: CodeCache | null = null;

async function getCodesByLevel(): Promise<CodeCache> {
  if (codeCache) { return codeCache; }

  const res = await fetch(METADATA_URL);
  if (!res.ok) { throw new Error(`TAB6571 metadata fetch failed: ${res.status}`); }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error('TAB6571: Region dimension not found'); }

  const countyCodes:        string[] = [];
  const municipalityCodes:  string[] = [];
  const regsoCodes:         string[] = [];
  const desoCodes:          string[] = [];
  const municipalityLabels: Record<string, string> = {};

  for (const code of Object.keys(regionCat.index)) {
    if (code === '00') { continue; }
    if      (code.includes('_RegSO')) { regsoCodes.push(code); }
    else if (code.includes('_DeSO'))  { desoCodes.push(code); }
    else if (code.length === 4) {
      municipalityCodes.push(code);
      municipalityLabels[code] = stripCodePrefix(regionCat.label[code] ?? code);
    }
    else if (code.length === 2) { countyCodes.push(code); }
  }

  codeCache = { countyCodes, municipalityCodes, regsoCodes, desoCodes, municipalityLabels };
  return codeCache;
}

// ── JSON-stat2 parsing ────────────────────────────────────────────────────────

/**
 * Parse response with Region × UtlBakgrund as the varying dimensions.
 * Requests UtlBakgrund=['1','2'] (utländsk + svensk bakgrund) and computes
 * utländsk / (utländsk + svensk) × 100 per region, avoiding reliance on
 * the 'SA' aggregation code which can fail at some admin levels.
 */
function computeForeignPct(
  data: JsonStat2Response,
): { values: Record<string, number>; labels: Record<string, string> } {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const utlDimIdx    = dimIds.indexOf('UtlBakgrund');
  if (regionDimIdx === -1 || utlDimIdx === -1) {
    throw new Error('TAB6571: missing Region or UtlBakgrund dimension');
  }

  const regionDim = data.dimension['Region'];
  const utlDim    = data.dimension['UtlBakgrund'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  const utlIdx = utlDim.category.index['1'] ?? -1;  // utländsk bakgrund
  const svkIdx = utlDim.category.index['2'] ?? -1;  // svensk bakgrund

  const foreignCount: Record<string, number> = {};
  const swedishCount: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const utl       = Math.floor(i / strides[utlDimIdx])    % sizes[utlDimIdx];
    const code      = indexToRegion[regionIdx];
    if (!code) { continue; }

    if (utl === utlIdx) { foreignCount[code] = (foreignCount[code] ?? 0) + num; }
    if (utl === svkIdx) { swedishCount[code] = (swedishCount[code] ?? 0) + num; }
  }

  const values: Record<string, number> = {};
  for (const [code, foreign] of Object.entries(foreignCount)) {
    const total = foreign + (swedishCount[code] ?? 0);
    if (total > 0) {
      values[code] = Math.round((foreign / total) * 1000) / 10; // one decimal %
    }
  }

  const rawLabels = regionDim.category.label as Record<string, string>;
  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(rawLabels)) {
    labels[code] = stripCodePrefix(label);
  }
  return { values, labels };
}

function stripSuffixes(raw: { values: Record<string, number>; labels: Record<string, string> }) {
  const values: Record<string, number> = {};
  const labels: Record<string, string> = {};
  for (const [code, value] of Object.entries(raw.values)) {
    values[code.replace(/_(RegSO|DeSO)\d+$/, '')] = value;
  }
  for (const [code, label] of Object.entries(raw.labels)) {
    labels[code.replace(/_(RegSO|DeSO)\d+$/, '')] = label;
  }
  return { values, labels };
}

// ── Data query ────────────────────────────────────────────────────────────────

async function postQuery(codes: string[], year: number): Promise<JsonStat2Response> {
  const res = await fetch(DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes              },
        { variableCode: 'UtlBakgrund',  valueCodes: ['1', '2']         },
        { variableCode: 'Kon',          valueCodes: ['1+2']            },
        { variableCode: 'ContentsCode', valueCodes: ['000007Y4']       },
        { variableCode: 'Tid',          valueCodes: [String(year)]     },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB6571 data fetch failed: ${res.status}`); }
  return res.json();
}

// ── Fetch functions ───────────────────────────────────────────────────────────

const EMPTY_SCALAR: ScalarDatasetResult = { kind: 'scalar', values: {}, labels: {}, label: 'Utländsk bakgrund', unit: '%' };

async function fetchByRegion(year: number): Promise<ScalarDatasetResult> {
  const { countyCodes } = await getCodesByLevel();
  if (countyCodes.length === 0) { return EMPTY_SCALAR; }
  const data = await postQuery(countyCodes, year);
  const { values, labels } = computeForeignPct(data);
  return { kind: 'scalar', values, labels, label: 'Utländsk bakgrund', unit: '%' };
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { municipalityCodes } = await getCodesByLevel();
  if (municipalityCodes.length === 0) { return EMPTY_SCALAR; }
  const data = await postQuery(municipalityCodes, year);
  const { values, labels } = computeForeignPct(data);
  return { kind: 'scalar', values, labels, label: 'Utländsk bakgrund', unit: '%' };
}

async function fetchByRegso(year: number): Promise<ScalarDatasetResult> {
  const [{ regsoCodes, municipalityLabels }, geoLabels] = await Promise.all([
    getCodesByLevel(),
    getGeoLabels('regso'),
  ]);
  // Boundary-locked: RegSO boundaries stable only at 2024 under _RegSO2025 codes.
  const data = await postQuery(regsoCodes, Math.min(year, 2024));
  const { values, labels } = stripSuffixes(computeForeignPct(data));
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Utländsk bakgrund', unit: '%',
    parentLabels: municipalityLabels,
  };
}

async function fetchByDeso(year: number): Promise<ScalarDatasetResult> {
  const [{ desoCodes, municipalityLabels }, geoLabels] = await Promise.all([
    getCodesByLevel(),
    getGeoLabels('deso'),
  ]);
  // Boundary-locked: DeSO boundaries stable only at 2024 under _DeSO2025 codes.
  const data = await postQuery(desoCodes, Math.min(year, 2024));
  const { values, labels } = stripSuffixes(computeForeignPct(data));
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Utländsk bakgrund', unit: '%',
    parentLabels: municipalityLabels,
  };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchUtlandskBakgrund(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  switch (level) {
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso(year);
    case 'DeSO':         return fetchByDeso(year);
    default: throw new Error(`Utländsk bakgrund: unsupported level "${level}"`);
  }
}

export const utlandskBakgrund: DatasetDescriptor = {
  id: 'utlandsk_bakgrund',
  label: 'Utländsk bakgrund',
  source: 'SCB',
  availableYears: Array.from({ length: 15 }, (_, i) => 2010 + i), // 2010–2024
  supportedLevels: ['Region', 'Municipality', 'RegSO', 'DeSO'],
  supportedViews: ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    RegSO: ['map', 'chart', 'table'],
    DeSO:  ['map', 'chart', 'table'],
  },
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['diverging', 'histogram'],
    RegSO:        ['diverging', 'histogram'],
    DeSO:         ['diverging', 'histogram'],
  },
  fetch: fetchUtlandskBakgrund,
};
