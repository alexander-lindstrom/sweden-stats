import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, DatasetResult } from '../types';

// ── TAB6679 constants ─────────────────────────────────────────────────────────
// "Andel av befolkningen per inkomstklass efter region, inkomstslag och kön"
// Covers all admin levels: county (2-digit), municipality (4-digit),
// RegSO (_RegSO2025 suffix), DeSO (_DeSO2025 suffix).

const DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6679/data?outputFormat=json-stat2';

const METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6679/metadata';

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
  countyCodes:       string[];
  municipalityCodes: string[];
  regsoCodes:        string[];
  desoCodes:         string[];
  municipalityLabels: Record<string, string>;
}

let codeCache: CodeCache | null = null;

async function getCodesByLevel(): Promise<CodeCache> {
  if (codeCache) return codeCache;

  const res = await fetch(METADATA_URL);
  if (!res.ok) throw new Error(`TAB6679 metadata fetch failed: ${res.status}`);

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) throw new Error('TAB6679: Region dimension not found');

  const countyCodes:        string[] = [];
  const municipalityCodes:  string[] = [];
  const regsoCodes:         string[] = [];
  const desoCodes:          string[] = [];
  const municipalityLabels: Record<string, string> = {};

  for (const code of Object.keys(regionCat.index)) {
    if (code === '00') continue; // skip Riket — single value, not useful for charts
    if      (code.includes('_RegSO')) regsoCodes.push(code);
    else if (code.includes('_DeSO'))  desoCodes.push(code);
    else if (code.length === 4) {
      municipalityCodes.push(code);
      municipalityLabels[code] = regionCat.label[code] ?? code;
    }
    else if (code.length === 2) countyCodes.push(code);
  }

  codeCache = { countyCodes, municipalityCodes, regsoCodes, desoCodes, municipalityLabels };
  return codeCache;
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
  if (regionDimIdx === -1) throw new Error('TAB6679 response missing "Region" dimension');

  const regionDim = data.dimension['Region'];
  const indexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToCode[idx as number] = code;
  }

  const values: Record<string, number> = {};
  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) continue;
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) continue;
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const code = indexToCode[regionIdx];
    if (code) values[code] = (values[code] ?? 0) + num;
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

// ── Data query ────────────────────────────────────────────────────────────────

async function postQuery(codes: string[], year: number): Promise<JsonStat2Response> {
  const res = await fetch(DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes   },
        { variableCode: 'Kon',          valueCodes: ['1+2'] },
        { variableCode: 'InkomstTyp',   valueCodes: ['NeInk'] },
        { variableCode: 'ContentsCode', valueCodes: ['0000089U'] },
        { variableCode: 'Tid',          valueCodes: [String(year)] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`TAB6679 data fetch failed: ${res.status}`);
  return res.json();
}

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchByRegion(year: number): Promise<DatasetResult> {
  const { countyCodes } = await getCodesByLevel();
  const data = await postQuery(countyCodes, year);
  const { values, labels } = aggregateByRegion(data);
  return { values, labels, label: 'Medianinkomst', unit: 'tkr' };
}

async function fetchByMunicipality(year: number): Promise<DatasetResult> {
  const { municipalityCodes } = await getCodesByLevel();
  const data = await postQuery(municipalityCodes, year);
  const { values, labels } = aggregateByRegion(data);
  return { values, labels, label: 'Medianinkomst', unit: 'tkr' };
}

async function fetchByRegso(): Promise<DatasetResult> {
  // Boundary-locked: RegSO boundaries stable only at 2024.
  const { regsoCodes, municipalityLabels } = await getCodesByLevel();
  const data = await postQuery(regsoCodes, 2024);
  const { values, labels } = stripSuffixes(aggregateByRegion(data));
  return { values, labels, label: 'Medianinkomst', unit: 'tkr', parentLabels: municipalityLabels };
}

async function fetchByDeso(): Promise<DatasetResult> {
  // Boundary-locked: DeSO boundaries stable only at 2024.
  const { desoCodes, municipalityLabels } = await getCodesByLevel();
  const data = await postQuery(desoCodes, 2024);
  const { values, labels } = stripSuffixes(aggregateByRegion(data));
  return { values, labels, label: 'Medianinkomst', unit: 'tkr', parentLabels: municipalityLabels };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchMedianinkomst(level: AdminLevel, year: number): Promise<DatasetResult> {
  switch (level) {
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso();
    case 'DeSO':         return fetchByDeso();
    default: throw new Error(`Medianinkomst: unsupported level "${level}"`);
  }
}

export const medianinkomst: DatasetDescriptor = {
  id: 'medianinkomst',
  label: 'Medianinkomst',
  source: 'SCB',
  availableYears: Array.from({ length: 14 }, (_, i) => 2011 + i),
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
  fetch: fetchMedianinkomst,
};
