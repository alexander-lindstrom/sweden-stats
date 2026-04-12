import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { getGeoLabels } from '../geoLabels';

// ── TAB628 constants (Region → Municipality) ──────────────────────────────────
// "Befolkningstäthet, folkmängd och landareal efter region och kön. År 1991–2025"
// ContentsCode BE0101U2 = folkmängd. Sex codes: "1" (men), "2" (women).

const DATA_URL_628 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB628/data?outputFormat=json-stat2';

const METADATA_URL_628 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB628/metadata';

const COUNTY_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

// ── TAB6574 constants (RegSO / DeSO) ─────────────────────────────────────────
// "Folkmängden per region efter ålder och kön. År 2010–2024"
// Age bands match medelalder.ts; summed across all bands to get totals by sex.

const DATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/data?outputFormat=json-stat2';

const METADATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/metadata';

const AGE_BAND_CODES = [
  '-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34',
  '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69',
  '70-74', '75-79', '80-',
];

// ── Shared types ──────────────────────────────────────────────────────────────

interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

// ── Municipality code cache (TAB628) ─────────────────────────────────────────

let municipalityCache: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCache) { return municipalityCache; }

  const res = await fetch(METADATA_URL_628);
  if (!res.ok) { throw new Error(`TAB628 metadata fetch failed: ${res.status}`); }

  const meta: MetadataResponse = await res.json();
  const cat = meta.dimension['Region']?.category;
  if (!cat) { throw new Error('TAB628: Region dimension not found'); }

  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(cat.label)) {
    if (/^\d{4}$/.test(code)) { labels[code] = label; }
  }

  municipalityCache = { codes: Object.keys(labels), labels };
  return municipalityCache;
}

// ── RegSO / DeSO code cache (TAB6574) ────────────────────────────────────────

let regsoDesoCache: { regsoCodes: string[]; desoCodes: string[] } | null = null;

async function getRegsoDeso(): Promise<{ regsoCodes: string[]; desoCodes: string[] }> {
  if (regsoDesoCache) { return regsoDesoCache; }

  const res = await fetch(METADATA_URL_6574);
  if (!res.ok) { throw new Error(`TAB6574 metadata fetch failed: ${res.status}`); }

  const meta: MetadataResponse = await res.json();
  const cat = meta.dimension['Region']?.category;
  if (!cat) { throw new Error('TAB6574: Region dimension not found'); }

  const regsoCodes: string[] = [];
  const desoCodes:  string[] = [];
  for (const code of Object.keys(cat.index)) {
    if (code.includes('_RegSO')) { regsoCodes.push(code); }
    else if (code.includes('_DeSO')) { desoCodes.push(code); }
  }

  regsoDesoCache = { regsoCodes, desoCodes };
  return regsoDesoCache;
}

// ── Computation helpers ───────────────────────────────────────────────────────

function computeFemaleShare628(
  data: JsonStat2Response,
  externalLabels?: Record<string, string>,
): { values: Record<string, number>; labels: Record<string, string> } {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const konDimIdx    = dimIds.indexOf('Kon');
  if (regionDimIdx === -1 || konDimIdx === -1) {
    throw new Error('TAB628: missing Region or Kon dimension');
  }

  const regionDim = data.dimension['Region'];
  const konDim    = data.dimension['Kon'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  const indexToKon: Record<number, string> = {};
  for (const [code, idx] of Object.entries(konDim.category.index)) {
    indexToKon[idx as number] = code;
  }

  const menCount:   Record<string, number> = {};
  const womenCount: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx  = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const konIdx     = Math.floor(i / strides[konDimIdx])    % sizes[konDimIdx];
    const regionCode = indexToRegion[regionIdx];
    const konCode    = indexToKon[konIdx];
    if (!regionCode || !konCode) { continue; }

    if (konCode === '1') { menCount[regionCode]   = (menCount[regionCode]   ?? 0) + num; }
    if (konCode === '2') { womenCount[regionCode] = (womenCount[regionCode] ?? 0) + num; }
  }

  const values: Record<string, number> = {};
  for (const code of Object.keys(menCount)) {
    const men   = menCount[code]   ?? 0;
    const women = womenCount[code] ?? 0;
    const total = men + women;
    if (total > 0) { values[code] = Math.round(women / total * 1000) / 10; }
  }

  const responseLabels = { ...regionDim.category.label } as Record<string, string>;
  const labels = externalLabels ? { ...externalLabels, ...responseLabels } : responseLabels;
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

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchByCounty(year: number): Promise<ScalarDatasetResult> {
  const res = await fetch(DATA_URL_628, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: COUNTY_CODES    },
        { variableCode: 'Kon',          valueCodes: ['1', '2']      },
        { variableCode: 'ContentsCode', valueCodes: ['BE0101U2']    },
        { variableCode: 'Tid',          valueCodes: [String(year)]  },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB628 county fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values, labels } = computeFemaleShare628(data);
  return { kind: 'scalar', values, labels, label: 'Andel kvinnor', unit: '%' };
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { codes, labels: metaLabels } = await getMunicipalityCodes();
  const res = await fetch(DATA_URL_628, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes           },
        { variableCode: 'Kon',          valueCodes: ['1', '2']      },
        { variableCode: 'ContentsCode', valueCodes: ['BE0101U2']    },
        { variableCode: 'Tid',          valueCodes: [String(year)]  },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB628 municipality fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values, labels } = computeFemaleShare628(data, metaLabels);
  return { kind: 'scalar', values, labels, label: 'Andel kvinnor', unit: '%' };
}

// Each region × 17 age bands × 2 sexes = 34 cells. SCB limit is ~100 000 cells,
// so cap batches at 2 000 codes (68 000 cells) and run them in parallel.
const BATCH_SIZE = 2000;

async function fetchBatch(codes: string[]): Promise<JsonStat2Response> {
  const res = await fetch(DATA_URL_6574, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes           },
        { variableCode: 'Alder',        valueCodes: AGE_BAND_CODES  },
        { variableCode: 'Kon',          valueCodes: ['1', '2']      },
        { variableCode: 'ContentsCode', valueCodes: ['000007Y7']    },
        { variableCode: 'Tid',          valueCodes: ['2024']        },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB6574 konsfordelning fetch failed: ${res.status}`); }
  return res.json();
}

async function fetchBySmallArea(codes: string[]): Promise<{ values: Record<string, number>; labels: Record<string, string> }> {
  // TAB6574: sum all age bands per (region, sex) to get total men / women counts.
  // Batch to stay within SCB's ~100 000-cell limit (34 cells per region).
  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    batches.push(codes.slice(i, i + BATCH_SIZE));
  }
  const responses = await Promise.all(batches.map(fetchBatch));

  const menCount:   Record<string, number> = {};
  const womenCount: Record<string, number> = {};
  let   mergedLabels: Record<string, string> = {};

  for (const data of responses) {
    const dimIds = data.id;
    const sizes  = data.size;

    const strides = new Array(dimIds.length).fill(1);
    for (let i = dimIds.length - 2; i >= 0; i--) {
      strides[i] = strides[i + 1] * sizes[i + 1];
    }

    const regionDimIdx = dimIds.indexOf('Region');
    const konDimIdx    = dimIds.indexOf('Kon');
    if (regionDimIdx === -1 || konDimIdx === -1) {
      throw new Error('TAB6574: missing Region or Kon dimension');
    }

    const regionDim = data.dimension['Region'];
    const konDim    = data.dimension['Kon'];

    const indexToRegion: Record<number, string> = {};
    for (const [code, idx] of Object.entries(regionDim.category.index)) {
      indexToRegion[idx as number] = code;
    }

    const indexToKon: Record<number, string> = {};
    for (const [code, idx] of Object.entries(konDim.category.index)) {
      indexToKon[idx as number] = code;
    }

    mergedLabels = { ...mergedLabels, ...regionDim.category.label as Record<string, string> };

    for (let i = 0; i < data.value.length; i++) {
      const raw = data.value[i];
      if (raw === null || raw === undefined) { continue; }
      const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
      if (isNaN(num) || num === 0) { continue; }

      const regionIdx  = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
      const konIdx     = Math.floor(i / strides[konDimIdx])    % sizes[konDimIdx];
      const regionCode = indexToRegion[regionIdx];
      const konCode    = indexToKon[konIdx];
      if (!regionCode || !konCode) { continue; }

      if (konCode === '1') { menCount[regionCode]   = (menCount[regionCode]   ?? 0) + num; }
      if (konCode === '2') { womenCount[regionCode] = (womenCount[regionCode] ?? 0) + num; }
    }
  }

  const values: Record<string, number> = {};
  for (const code of Object.keys(menCount)) {
    const men   = menCount[code]   ?? 0;
    const women = womenCount[code] ?? 0;
    const total = men + women;
    if (total > 0) { values[code] = Math.round(women / total * 1000) / 10; }
  }

  return { values, labels: mergedLabels };
}

async function fetchByRegso(): Promise<ScalarDatasetResult> {
  const [{ regsoCodes }, { labels: parentLabels }, geoLabels] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes(),
    getGeoLabels('regso'),
  ]);
  const raw = await fetchBySmallArea(regsoCodes);
  const { values, labels } = stripSuffixes(raw);
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Andel kvinnor', unit: '%',
    parentLabels,
  };
}

async function fetchByDeso(): Promise<ScalarDatasetResult> {
  const [{ desoCodes }, { labels: parentLabels }, geoLabels] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes(),
    getGeoLabels('deso'),
  ]);
  const raw = await fetchBySmallArea(desoCodes);
  const { values, labels } = stripSuffixes(raw);
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Andel kvinnor', unit: '%',
    parentLabels,
  };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchKonsfordelning(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  switch (level) {
    case 'Region':       return fetchByCounty(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso();
    case 'DeSO':         return fetchByDeso();
    default: throw new Error(`Könsfördelning: unsupported level "${level}"`);
  }
}

export const konsfordelning: DatasetDescriptor = {
  id: 'konsfordelning',
  label: 'Könsfördelning',
  category: 'befolkning' as const,
  source: 'SCB',
  colorScaleType:  'diverging',
  divergingCenter: 50,
  availableYears: Array.from({ length: 16 }, (_, i) => 2010 + i),
  supportedLevels: ['Region', 'Municipality', 'RegSO', 'DeSO'],
  supportedViews: ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    RegSO: ['map', 'chart', 'table'],
    DeSO:  ['map', 'chart', 'table'],
  },
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['diverging', 'histogram', 'boxplot'],
    RegSO:        ['diverging', 'histogram', 'boxplot'],
    DeSO:         ['diverging', 'histogram', 'boxplot'],
  },
  fetch: fetchKonsfordelning,
};
