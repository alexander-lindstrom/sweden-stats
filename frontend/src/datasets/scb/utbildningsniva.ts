import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { getGeoLabels } from '../geoLabels';
import { stripCodePrefix } from '@/utils/labelFormatting';

// "% with post-secondary education" = SUN2000 levels 5 + 6.
// "US" (missing classification) is excluded from the denominator.
const POST_SECONDARY = new Set(['5', '6']);

// ── Data sources ──────────────────────────────────────────────────────────────
// TAB5956: 2015–2023, RegSO/DeSO codes without year suffix.
// TAB6534: 2024 only, RegSO/DeSO codes carry _RegSO2025 / _DeSO2025 suffix.

const TAB5956_DATA = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5956/data?outputFormat=json-stat2';
const TAB5956_META = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5956/metadata';

const TAB6534_DATA = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6534/data?outputFormat=json-stat2';
const TAB6534_META = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6534/metadata';

// ── Metadata types ────────────────────────────────────────────────────────────

interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

// ── Code caches ───────────────────────────────────────────────────────────────

interface CodeCache {
  countyCodes:        string[];
  municipalityCodes:  string[];
  regsoCodes:         string[];
  desoCodes:          string[];
  municipalityLabels: Record<string, string>;
}

let cache5956: CodeCache | null = null;
let cache6534: Pick<CodeCache, 'regsoCodes' | 'desoCodes'> | null = null;

async function getCodes5956(): Promise<CodeCache> {
  if (cache5956) { return cache5956; }

  const res = await fetch(TAB5956_META);
  if (!res.ok) { throw new Error(`TAB5956 metadata fetch failed: ${res.status}`); }
  const meta: MetadataResponse = await res.json();
  const cat = meta.dimension['Region']?.category;
  if (!cat) { throw new Error('TAB5956: Region dimension not found'); }

  const countyCodes:        string[] = [];
  const municipalityCodes:  string[] = [];
  const regsoCodes:         string[] = [];
  const desoCodes:          string[] = [];
  const municipalityLabels: Record<string, string> = {};

  for (const code of Object.keys(cat.index)) {
    if (code === '00') { continue; }
    if      (/^\d{2}$/.test(code))    { countyCodes.push(code); }
    else if (/^\d{4}$/.test(code))    { municipalityCodes.push(code); municipalityLabels[code] = stripCodePrefix(cat.label[code] ?? code); }
    else if (/^\d{4}R\d+$/.test(code)){ regsoCodes.push(code); }
    else if (/^\d{4}A\d+$/.test(code)){ desoCodes.push(code); }
  }

  cache5956 = { countyCodes, municipalityCodes, regsoCodes, desoCodes, municipalityLabels };
  return cache5956;
}

async function getCodes6534(): Promise<Pick<CodeCache, 'regsoCodes' | 'desoCodes'>> {
  if (cache6534) { return cache6534; }

  const res = await fetch(TAB6534_META);
  if (!res.ok) { throw new Error(`TAB6534 metadata fetch failed: ${res.status}`); }
  const meta: MetadataResponse = await res.json();
  const cat = meta.dimension['Region']?.category;
  if (!cat) { throw new Error('TAB6534: Region dimension not found'); }

  const regsoCodes: string[] = [];
  const desoCodes:  string[] = [];

  for (const code of Object.keys(cat.index)) {
    if      (code.includes('_RegSO')) { regsoCodes.push(code); }
    else if (code.includes('_DeSO'))  { desoCodes.push(code); }
  }

  cache6534 = { regsoCodes, desoCodes };
  return cache6534;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

function tableForYear(year: number): { url: string; contents: string } {
  return year === 2024
    ? { url: TAB6534_DATA, contents: '000007Z6' }
    : { url: TAB5956_DATA, contents: '000005MO' };
}

async function postQuery(url: string, codes: string[], contents: string, year: number): Promise<JsonStat2Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',          valueCodes: codes                          },
        { variableCode: 'UtbildningsNiva', valueCodes: ['21', '3+4', '5', '6', 'US'] },
        { variableCode: 'ContentsCode',    valueCodes: [contents]                     },
        { variableCode: 'Tid',             valueCodes: [String(year)]                 },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`Utbildningsnivå fetch failed: ${res.status}`); }
  return res.json();
}

// ── Computation ───────────────────────────────────────────────────────────────

function computePct(
  data: JsonStat2Response,
): { values: Record<string, number>; labels: Record<string, string> } {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const eduDimIdx    = dimIds.indexOf('UtbildningsNiva');
  if (regionDimIdx === -1 || eduDimIdx === -1) {
    throw new Error('Utbildningsnivå: missing expected dimensions in response');
  }

  const regionDim = data.dimension['Region'];
  const eduDim    = data.dimension['UtbildningsNiva'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  const indexToEdu: Record<number, string> = {};
  for (const [code, idx] of Object.entries(eduDim.category.index)) {
    indexToEdu[idx as number] = code;
  }

  const postSec: Record<string, number> = {};
  const known:   Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx  = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const eduIdx     = Math.floor(i / strides[eduDimIdx])    % sizes[eduDimIdx];
    const regionCode = indexToRegion[regionIdx];
    const eduCode    = indexToEdu[eduIdx];
    if (!regionCode || !eduCode || eduCode === 'US') { continue; }

    known[regionCode]   = (known[regionCode]   ?? 0) + num;
    if (POST_SECONDARY.has(eduCode)) {
      postSec[regionCode] = (postSec[regionCode] ?? 0) + num;
    }
  }

  const values: Record<string, number> = {};
  for (const [code, knownCount] of Object.entries(known)) {
    if (knownCount > 0) {
      values[code] = Math.round((postSec[code] ?? 0) / knownCount * 1000) / 10;
    }
  }

  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(regionDim.category.label as Record<string, string>)) {
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

// ── Fetch functions ───────────────────────────────────────────────────────────

async function fetchByRegion(year: number): Promise<ScalarDatasetResult> {
  const { countyCodes } = await getCodes5956();
  const { url, contents } = tableForYear(year);
  const data = await postQuery(url, countyCodes, contents, year);
  const { values, labels } = computePct(data);
  return { kind: 'scalar', values, labels, label: 'Eftergymnasial utbildning', unit: '%' };
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { municipalityCodes, municipalityLabels } = await getCodes5956();
  const { url, contents } = tableForYear(year);
  const data = await postQuery(url, municipalityCodes, contents, year);
  const { values, labels } = computePct(data);
  return { kind: 'scalar', values, labels: { ...municipalityLabels, ...labels }, label: 'Eftergymnasial utbildning', unit: '%' };
}

async function fetchByRegso(year: number): Promise<ScalarDatasetResult> {
  const [{ municipalityLabels }, geoLabels] = await Promise.all([
    getCodes5956(),
    getGeoLabels('regso'),
  ]);

  let result: { values: Record<string, number>; labels: Record<string, string> };
  if (year === 2024) {
    const { regsoCodes } = await getCodes6534();
    const data = await postQuery(TAB6534_DATA, regsoCodes, '000007Z6', 2024);
    result = stripSuffixes(computePct(data));
  } else {
    const { regsoCodes } = await getCodes5956();
    const data = await postQuery(TAB5956_DATA, regsoCodes, '000005MO', year);
    result = computePct(data);
  }

  return {
    kind: 'scalar',
    values: result.values,
    labels: { ...result.labels, ...geoLabels },
    label: 'Eftergymnasial utbildning', unit: '%',
    parentLabels: municipalityLabels,
  };
}

async function fetchByDeso(year: number): Promise<ScalarDatasetResult> {
  const [{ municipalityLabels }, geoLabels] = await Promise.all([
    getCodes5956(),
    getGeoLabels('deso'),
  ]);

  let result: { values: Record<string, number>; labels: Record<string, string> };
  if (year === 2024) {
    const { desoCodes } = await getCodes6534();
    const data = await postQuery(TAB6534_DATA, desoCodes, '000007Z6', 2024);
    result = stripSuffixes(computePct(data));
  } else {
    const { desoCodes } = await getCodes5956();
    const data = await postQuery(TAB5956_DATA, desoCodes, '000005MO', year);
    result = computePct(data);
  }

  return {
    kind: 'scalar',
    values: result.values,
    labels: { ...result.labels, ...geoLabels },
    label: 'Eftergymnasial utbildning', unit: '%',
    parentLabels: municipalityLabels,
  };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchUtbildningsniva(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  switch (level) {
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso(year);
    case 'DeSO':         return fetchByDeso(year);
    default: throw new Error(`Utbildningsnivå: unsupported level "${level}"`);
  }
}

export const utbildningsniva: DatasetDescriptor = {
  id: 'utbildningsniva',
  label: 'Utbildningsnivå',
  category: 'utbildning' as const,
  source: 'SCB',
  availableYears: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
  supportedLevels: ['Region', 'Municipality', 'RegSO', 'DeSO'],
  supportedViews: ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    RegSO: ['map', 'chart', 'table'],
    DeSO:  ['map', 'chart', 'table'],
  },
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram', 'scatter'],
    Municipality: ['diverging', 'histogram', 'scatter', 'boxplot'],
    RegSO:        ['diverging', 'histogram', 'scatter', 'boxplot'],
    DeSO:         ['diverging', 'histogram', 'scatter', 'boxplot'],
  },
  fetch: fetchUtbildningsniva,
};
