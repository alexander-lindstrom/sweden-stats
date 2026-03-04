import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, DatasetResult, GeoHierarchyNode } from '../types';
import { stripLanSuffix, stripOuterParens } from '@/utils/labelFormatting';

// ── TAB5444 constants (Country → Region, Region → Municipality) ──────────────

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

const DATA_URL_5444 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5444/data?outputFormat=json-stat2';

const METADATA_URL_5444 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5444/metadata';

// ── TAB6574 constants (Municipality → RegSO, RegSO/DeSO → DeSO) ─────────────

const DATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/data?outputFormat=json-stat2';

const METADATA_URL_6574 =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6574/metadata';

// ── Shared types ─────────────────────────────────────────────────────────────

// Subset of JSON-stat2 returned by the /metadata endpoint (no value array).
interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

// ── Municipality code cache ───────────────────────────────────────────────────

// Cached after the first fetch — municipality codes are stable across the session.
let municipalityCodeCache: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCodeCache) {
    return municipalityCodeCache;
  }

  const res = await fetch(METADATA_URL_5444);
  if (!res.ok) {
    throw new Error(`SCB metadata fetch failed: ${res.status} ${res.statusText}`);
  }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) {
    throw new Error('SCB metadata: Region dimension not found');
  }

  // Municipality codes are 4 digits; county codes are 2 digits; "00" is Riket.
  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(regionCat.label)) {
    if (code.length === 4) {
      labels[code] = label;
    }
  }

  municipalityCodeCache = { codes: Object.keys(labels), labels };
  return municipalityCodeCache;
}

// ── RegSO / DeSO code cache ──────────────────────────────────────────────────

// SCB codes carry a vintage suffix (_RegSO2025, _DeSO2025) but GeoServer
// feature properties use bare codes (e.g. 0114R001, 0114A0010).
// We cache the full (suffixed) SCB codes for querying and strip them for lookup.
let regsoDesoCache: { regsoCodes: string[]; desoCodes: string[] } | null = null;

async function getRegsoDeso(): Promise<{ regsoCodes: string[]; desoCodes: string[] }> {
  if (regsoDesoCache) {
    return regsoDesoCache;
  }

  const res = await fetch(METADATA_URL_6574);
  if (!res.ok) {
    throw new Error(`SCB TAB6574 metadata fetch failed: ${res.status} ${res.statusText}`);
  }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) {
    throw new Error('SCB TAB6574: Region dimension not found');
  }

  const regsoCodes: string[] = [];
  const desoCodes:  string[] = [];
  for (const code of Object.keys(regionCat.index)) {
    if (code.includes('_RegSO')) {
      regsoCodes.push(code);
    } else if (code.includes('_DeSO')) {
      desoCodes.push(code);
    }
  }

  regsoDesoCache = { regsoCodes, desoCodes };
  return regsoDesoCache;
}

// ── JSON-stat2 aggregation ───────────────────────────────────────────────────

interface AggregatedData {
  values: Record<string, number>;
  labels: Record<string, string>;
}

/**
 * Aggregate JSON-stat2 values by the "Region" dimension, summing all other
 * dimensions (age, sex, …).  Labels come from the response category metadata
 * and are merged with any externally supplied labels (used for municipalities
 * where labels are fetched separately from the metadata endpoint).
 */
function aggregateByRegion(
  data: JsonStat2Response,
  externalLabels?: Record<string, string>,
): AggregatedData {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  if (regionDimIdx === -1) {
    throw new Error('SCB response missing "Region" dimension');
  }

  const regionDim = data.dimension['Region'];
  const indexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToCode[idx as number] = code;
  }

  const values: Record<string, number> = {};
  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) {
      continue;
    }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) {
      continue;
    }
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const code = indexToCode[regionIdx];
    if (code) {
      values[code] = (values[code] ?? 0) + num;
    }
  }

  const responseLabels = { ...regionDim.category.label } as Record<string, string>;
  const labels = externalLabels
    ? { ...externalLabels, ...responseLabels }
    : responseLabels;

  return { values, labels };
}

/**
 * Strip the SCB vintage suffix (_RegSO2025, _DeSO2025, …) from region codes
 * so they match the bare codes stored in GeoServer feature properties.
 */
function stripSuffixes(raw: AggregatedData): AggregatedData {
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

// ── Fetch functions ──────────────────────────────────────────────────────────

async function postDataQuery5444(selection: object[]): Promise<JsonStat2Response> {
  const res = await fetch(DATA_URL_5444, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selection }),
  });
  if (!res.ok) {
    throw new Error(`SCB API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function postDataQuery6574(codes: string[]): Promise<JsonStat2Response> {
  const res = await fetch(DATA_URL_6574, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: codes },
        { variableCode: 'Alder',        valueCodes: ['totalt'] },
        { variableCode: 'Kon',          valueCodes: ['1+2'] },
        { variableCode: 'ContentsCode', valueCodes: ['000007Y7'] },
        { variableCode: 'Tid',          valueCodes: ['2024'] },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`SCB API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchByCounty(year: number): Promise<DatasetResult> {
  const data = await postDataQuery5444([
    { variableCode: 'Region',       valueCodes: REGION_CODES },
    { variableCode: 'Kon',          valueCodes: ['1', '2'] },
    { variableCode: 'ContentsCode', valueCodes: ['000003O5'] },
    { variableCode: 'Tid',          valueCodes: [`${year}M12`] },
  ]);
  const { values, labels } = aggregateByRegion(data);
  return { values, labels, label: 'Folkmängd', unit: 'personer' };
}

async function fetchByMunicipality(year: number): Promise<DatasetResult> {
  const { codes, labels: metaLabels } = await getMunicipalityCodes();
  const data = await postDataQuery5444([
    { variableCode: 'Region',       valueCodes: codes },
    { variableCode: 'Kon',          valueCodes: ['1', '2'] },
    { variableCode: 'ContentsCode', valueCodes: ['000003O5'] },
    { variableCode: 'Tid',          valueCodes: [`${year}M12`] },
  ]);
  const { values, labels } = aggregateByRegion(data, metaLabels);
  return { values, labels, label: 'Folkmängd', unit: 'personer' };
}

async function fetchByRegso(): Promise<DatasetResult> {
  const [{ regsoCodes }, { labels: parentLabels }] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes(),
  ]);
  const data = await postDataQuery6574(regsoCodes);
  const { values, labels } = stripSuffixes(aggregateByRegion(data));
  return { values, labels, label: 'Folkmängd', unit: 'personer', parentLabels };
}

async function fetchByDeso(): Promise<DatasetResult> {
  const [{ desoCodes }, { labels: parentLabels }] = await Promise.all([
    getRegsoDeso(),
    getMunicipalityCodes(),
  ]);
  const data = await postDataQuery6574(desoCodes);
  const { values, labels } = stripSuffixes(aggregateByRegion(data));
  return { values, labels, label: 'Folkmängd', unit: 'personer', parentLabels };
}

// ── Hierarchy builder ────────────────────────────────────────────────────────

export async function fetchPopulationHierarchy(year: number): Promise<GeoHierarchyNode> {
  const [countyResult, municipalityResult] = await Promise.all([
    fetchByCounty(year),
    fetchByMunicipality(year),
  ]);

  // Build läns nodes with their kommuner as children.
  const lans: GeoHierarchyNode[] = REGION_CODES.map((countyCode) => {
    const countyName  = stripLanSuffix(countyResult.labels[countyCode] ?? countyCode);
    const countyValue = countyResult.values[countyCode] ?? 0;

    // Municipalities whose 4-digit code starts with the 2-digit county code.
    const children: GeoHierarchyNode[] = Object.entries(municipalityResult.values)
      .filter(([mCode]) => mCode.startsWith(countyCode))
      .map(([mCode, mValue]) => ({
        code:  mCode,
        name:  stripOuterParens(municipalityResult.labels[mCode] ?? mCode),
        value: mValue,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      code:     countyCode,
      name:     countyName,
      value:    countyValue,
      children,
    };
  }).sort((a, b) => b.value - a.value);

  const totalValue = lans.reduce((sum, lan) => sum + lan.value, 0);

  return {
    code:     'SE',
    name:     'Sverige',
    value:    totalValue,
    children: lans,
  };
}

// ── Descriptor ───────────────────────────────────────────────────────────────

async function fetchPopulation(level: AdminLevel, year: number): Promise<DatasetResult> {
  switch (level) {
    case 'Country':      return fetchByCounty(year);
    case 'Region':       return fetchByCounty(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso();
    case 'DeSO':         return fetchByDeso();
    default:
      throw new Error(`Population dataset: unsupported level "${level}"`);
  }
}

export const population: DatasetDescriptor = {
  id: 'population',
  label: 'Folkmängd',
  source: 'SCB',
  availableYears: Array.from({ length: 25 }, (_, i) => 2000 + i),
  supportedLevels: ['Country', 'Region', 'Municipality', 'RegSO', 'DeSO'],
  supportedViews: ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    Country: ['chart'],
    RegSO:   ['map', 'table'],
    DeSO:    ['map', 'table'],
  },
  chartTypes: {
    Country:      ['sunburst'],
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['diverging', 'histogram'],
    RegSO:        ['diverging', 'histogram'],
    DeSO:         ['diverging', 'histogram'],
  },
  sunburstDepthToLevel: ['Country', 'Region', 'Municipality'],
  fetch: fetchPopulation,
  fetchHierarchy: fetchPopulationHierarchy,
};
