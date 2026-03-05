import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';

// ── TAB637 constants (Country → Region → Municipality) ────────────────────────

const DATA_URL_637 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB637/data?outputFormat=json-stat2';

const METADATA_URL_637 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB637/metadata';

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

// ── TAB6574 constants (RegSO / DeSO) ─────────────────────────────────────────

const DATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/data?outputFormat=json-stat2';

const METADATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/metadata';

// 5-year bands from TAB6574 and their midpoints for weighted mean calculation.
// The open-ended 80+ band uses 85 as a reasonable midpoint.
const AGE_BANDS: { code: string; midpoint: number }[] = [
  { code: '-4',   midpoint: 2.5  },
  { code: '5-9',  midpoint: 7.5  },
  { code: '10-14',midpoint: 12.5 },
  { code: '15-19',midpoint: 17.5 },
  { code: '20-24',midpoint: 22.5 },
  { code: '25-29',midpoint: 27.5 },
  { code: '30-34',midpoint: 32.5 },
  { code: '35-39',midpoint: 37.5 },
  { code: '40-44',midpoint: 42.5 },
  { code: '45-49',midpoint: 47.5 },
  { code: '50-54',midpoint: 52.5 },
  { code: '55-59',midpoint: 57.5 },
  { code: '60-64',midpoint: 62.5 },
  { code: '65-69',midpoint: 67.5 },
  { code: '70-74',midpoint: 72.5 },
  { code: '75-79',midpoint: 77.5 },
  { code: '80-',  midpoint: 85.0 },
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

// ── Municipality code cache (TAB637) ─────────────────────────────────────────

let municipalityCodeCache637: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes637(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCodeCache637) {return municipalityCodeCache637;}

  const res = await fetch(METADATA_URL_637);
  if (!res.ok) {throw new Error(`TAB637 metadata fetch failed: ${res.status}`);}

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) {throw new Error('TAB637: Region dimension not found');}

  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(regionCat.label)) {
    if (code.length === 4) {labels[code] = label;}
  }

  municipalityCodeCache637 = { codes: Object.keys(labels), labels };
  return municipalityCodeCache637;
}

// ── RegSO / DeSO code cache (TAB6574) ────────────────────────────────────────

let regsoDesoCache: { regsoCodes: string[]; desoCodes: string[] } | null = null;

async function getRegsoDeso(): Promise<{ regsoCodes: string[]; desoCodes: string[] }> {
  if (regsoDesoCache) {return regsoDesoCache;}

  const res = await fetch(METADATA_URL_6574);
  if (!res.ok) {throw new Error(`TAB6574 metadata fetch failed: ${res.status}`);}

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) {throw new Error('TAB6574: Region dimension not found');}

  const regsoCodes: string[] = [];
  const desoCodes:  string[] = [];
  for (const code of Object.keys(regionCat.index)) {
    if (code.includes('_RegSO')) {regsoCodes.push(code);}
    else if (code.includes('_DeSO')) {desoCodes.push(code);}
  }

  regsoDesoCache = { regsoCodes, desoCodes };
  return regsoDesoCache;
}

// ── JSON-stat2 helpers ────────────────────────────────────────────────────────

function aggregateByRegion(
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
  if (regionDimIdx === -1) {throw new Error('SCB response missing "Region" dimension');}

  const regionDim = data.dimension['Region'];
  const indexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToCode[idx as number] = code;
  }

  const values: Record<string, number> = {};
  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) {continue;}
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) {continue;}
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const code = indexToCode[regionIdx];
    if (code) {values[code] = (values[code] ?? 0) + num;}
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
  const res = await fetch(DATA_URL_637, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: REGION_CODES },
        { variableCode: 'Kon',          valueCodes: ['1+2'] },
        { variableCode: 'ContentsCode', valueCodes: ['BE0101G9'] },
        { variableCode: 'Tid',          valueCodes: [String(year)] },
      ],
    }),
  });
  if (!res.ok) {throw new Error(`TAB637 fetch failed: ${res.status}`);}
  const data: JsonStat2Response = await res.json();
  const { values, labels } = aggregateByRegion(data);
  return { kind: 'scalar', values, labels, label: 'Medelålder', unit: 'år' };
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { codes, labels: metaLabels } = await getMunicipalityCodes637();
  const res = await fetch(DATA_URL_637, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes },
        { variableCode: 'Kon',          valueCodes: ['1+2'] },
        { variableCode: 'ContentsCode', valueCodes: ['BE0101G9'] },
        { variableCode: 'Tid',          valueCodes: [String(year)] },
      ],
    }),
  });
  if (!res.ok) {throw new Error(`TAB637 municipality fetch failed: ${res.status}`);}
  const data: JsonStat2Response = await res.json();
  const { values, labels } = aggregateByRegion(data, metaLabels);
  return { kind: 'scalar', values, labels, label: 'Medelålder', unit: 'år' };
}

async function fetchBySmallArea(codes: string[]): Promise<ScalarDatasetResult> {
  // TAB6574 has no pre-computed medelålder — compute as weighted mean from age bands.
  // Boundary-locked: RegSO/DeSO boundaries are stable only at 2024.
  const res = await fetch(DATA_URL_6574, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes },
        { variableCode: 'Alder',        valueCodes: AGE_BANDS.map(b => b.code) },
        { variableCode: 'Kon',          valueCodes: ['1+2'] },
        { variableCode: 'ContentsCode', valueCodes: ['000007Y7'] },
        { variableCode: 'Tid',          valueCodes: ['2024'] },
      ],
    }),
  });
  if (!res.ok) {throw new Error(`TAB6574 medelålder fetch failed: ${res.status}`);}

  const data: JsonStat2Response = await res.json();
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const alderDimIdx  = dimIds.indexOf('Alder');
  if (regionDimIdx === -1 || alderDimIdx === -1) {
    throw new Error('TAB6574: missing Region or Alder dimension');
  }

  const regionDim = data.dimension['Region'];
  const alderDim  = data.dimension['Alder'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  // Map Alder index → midpoint
  const indexToMidpoint: Record<number, number> = {};
  for (const [code, idx] of Object.entries(alderDim.category.index)) {
    const band = AGE_BANDS.find(b => b.code === code);
    if (band) {indexToMidpoint[idx as number] = band.midpoint;}
  }

  // Accumulate weighted sum and total count per region.
  const weightedSum: Record<string, number> = {};
  const totalCount:  Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) {continue;}
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num) || num === 0) {continue;}

    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const alderIdx  = Math.floor(i / strides[alderDimIdx])  % sizes[alderDimIdx];
    const regionCode = indexToRegion[regionIdx];
    const midpoint   = indexToMidpoint[alderIdx];

    if (regionCode === undefined || midpoint === undefined) {continue;}

    weightedSum[regionCode] = (weightedSum[regionCode] ?? 0) + midpoint * num;
    totalCount[regionCode]  = (totalCount[regionCode]  ?? 0) + num;
  }

  const values: Record<string, number> = {};
  for (const [code, sum] of Object.entries(weightedSum)) {
    const total = totalCount[code];
    if (total > 0) {values[code] = Math.round((sum / total) * 10) / 10;} // 1 decimal
  }

  const labels = { ...regionDim.category.label } as Record<string, string>;
  const stripped = stripSuffixes({ values, labels });
  return { kind: 'scalar', ...stripped, label: 'Medelålder', unit: 'år' };
}

async function fetchByRegso(): Promise<ScalarDatasetResult> {
  const [{ regsoCodes }, { labels: parentLabels }] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes637(),
  ]);
  const result = await fetchBySmallArea(regsoCodes);
  return { ...result, parentLabels };
}

async function fetchByDeso(): Promise<ScalarDatasetResult> {
  const [{ desoCodes }, { labels: parentLabels }] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes637(),
  ]);
  const result = await fetchBySmallArea(desoCodes);
  return { ...result, parentLabels };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchMedelalder(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  switch (level) {
    case 'Region':       return fetchByCounty(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso();
    case 'DeSO':         return fetchByDeso();
    default: throw new Error(`Medelålder: unsupported level "${level}"`);
  }
}

export const medelalder: DatasetDescriptor = {
  id: 'medelalder',
  label: 'Medelålder',
  source: 'SCB',
  availableYears: Array.from({ length: 27 }, (_, i) => 1998 + i),
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
  fetch: fetchMedelalder,
};
