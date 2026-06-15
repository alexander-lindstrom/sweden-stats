import { JsonStat2Response } from '@/util/scb';
import { MetadataResponse, buildReverseIndex, buildStrides, parseScbValue, postScbQuery } from '@/util/jsonstat';
import { AdminLevel, DatasetDescriptor, DatasetResult, ScalarDatasetResult, ViewType } from '../types';
import { stripCodePrefix } from '@/utils/labelFormatting';

// ── Elbalans — electricity production (TAB3451) minus electricity consumption
//    (TAB3654, Bränsle='16') per region ───────────────────────────────────────

const PRODUCTION_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3451/data?outputFormat=json-stat2';

const CONSUMPTION_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3654/data?outputFormat=json-stat2';

const PRODUCTION_METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3451/metadata';

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

const PRODUCTION_CODES = ['4.1', '4.2', '4.7', '4.5+4.6', '4.3+4.4'];

const CONSUMER_CODES = ['911', '921', '931', '941', '951', '98', '97', '964'];

const FIRST_YEAR = 2009;
const LAST_YEAR  = 2024;
const AVAILABLE_YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// ── Municipality code cache ──────────────────────────────────────────────────

let municipalityCodeCache: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCodeCache) { return municipalityCodeCache; }

  const res = await fetch(PRODUCTION_METADATA_URL);
  if (!res.ok) { throw new Error(`TAB3451 metadata fetch failed: ${res.status}`); }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error('TAB3451: Region dimension not found'); }

  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(regionCat.label)) {
    if (code.length === 4) {
      labels[code] = stripCodePrefix(label);
    }
  }

  municipalityCodeCache = { codes: Object.keys(labels), labels };
  return municipalityCodeCache;
}

void getMunicipalityCodes();

// ── Shared: extract per-region MWh totals with Totalt-fallback ───────────────
// Uses the SCB "Totalt" row when available; falls back to summing individual
// categories when Totalt is null (SCB redacts the total when publishing it
// would reveal a redacted component).

function extractWithFallback(
  data: JsonStat2Response,
  categoryDimName: string,
  totalCode: string,
  externalLabels?: Record<string, string>,
): { values: Record<string, number>; labels: Record<string, string> } {
  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const regionDimIdx = dimIds.indexOf('Region');
  const catDimIdx    = dimIds.indexOf(categoryDimName);
  const regionDim    = data.dimension['Region'];
  const catDim       = data.dimension[categoryDimName];
  const indexToRegion = buildReverseIndex(regionDim.category);
  const indexToCat    = buildReverseIndex(catDim.category);

  const totals:   Record<string, number | null> = {};
  const partials: Record<string, number> = {};
  const labels:   Record<string, string> = {};

  for (let i = 0; i < data.value.length; i++) {
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const catIdx    = Math.floor(i / strides[catDimIdx])    % sizes[catDimIdx];
    const code    = indexToRegion[regionIdx];
    const catCode = indexToCat[catIdx];
    if (!code || !catCode) { continue; }

    if (!labels[code]) {
      labels[code] = externalLabels?.[code]
        ?? stripCodePrefix(regionDim.category.label[code] ?? code);
    }

    const num = parseScbValue(data.value[i]);
    if (num === null) {
      if (catCode === totalCode && !(code in totals)) {
        totals[code] = null;
      }
      continue;
    }

    if (catCode === totalCode) {
      totals[code] = num;
    } else if (typeof totals[code] !== 'number') {
      partials[code] = (partials[code] ?? 0) + num;
    }
  }

  const values: Record<string, number> = {};
  for (const code of Object.keys(labels)) {
    const total = totals[code];
    if (total !== null && total !== undefined) {
      values[code] = total;
    } else if (partials[code] !== undefined) {
      values[code] = partials[code];
    }
  }

  return { values, labels };
}

// ── Fetch: balance scalar ────────────────────────────────────────────────────

async function fetchBalance(
  regionCodes: string[],
  year: number,
  mode: 'absolute' | 'ratio',
  externalLabels?: Record<string, string>,
): Promise<ScalarDatasetResult> {
  const [prodData, consData] = await Promise.all([
    postScbQuery(PRODUCTION_URL, [
      { variableCode: 'Region',          valueCodes: regionCodes },
      { variableCode: 'Produktionssatt', valueCodes: [...PRODUCTION_CODES, 'Totalt'] },
      { variableCode: 'Bransle',         valueCodes: ['17'] },
      { variableCode: 'ContentsCode',    valueCodes: ['EN0203AD'] },
      { variableCode: 'Tid',            valueCodes: [String(year)] },
    ]),
    postScbQuery(CONSUMPTION_URL, [
      { variableCode: 'Region',             valueCodes: regionCodes },
      { variableCode: 'Forbrukningskategri', valueCodes: [...CONSUMER_CODES, '999'] },
      { variableCode: 'Bransle',            valueCodes: ['16'] },
      { variableCode: 'ContentsCode',       valueCodes: ['EN0203AE'] },
      { variableCode: 'Tid',               valueCodes: [String(year)] },
    ]),
  ]);

  const prod = extractWithFallback(prodData, 'Produktionssatt', 'Totalt', externalLabels);
  const cons = extractWithFallback(consData, 'Forbrukningskategri', '999', externalLabels);

  const allCodes = new Set([...Object.keys(prod.values), ...Object.keys(cons.values)]);
  const values: Record<string, number> = {};
  const labels: Record<string, string> = {};

  for (const code of allCodes) {
    const p = prod.values[code];
    const c = cons.values[code];
    if (p === undefined || c === undefined) { continue; }

    labels[code] = prod.labels[code] ?? cons.labels[code] ?? code;

    if (mode === 'ratio') {
      values[code] = c > 0 ? Math.round((p / c) * 100) / 100 : 0;
    } else {
      values[code] = Math.round((p - c) / 1000);
    }
  }

  return {
    kind: 'scalar',
    values,
    labels,
    label: mode === 'ratio' ? 'Självförsörjningsgrad (el)' : 'Elbalans',
    unit:  mode === 'ratio' ? '×' : 'GWh',
  };
}

// ── Fetch routers ────────────────────────────────────────────────────────────

async function fetchAbsolut(level: AdminLevel, year: number): Promise<DatasetResult> {
  switch (level) {
    case 'Region':
      return fetchBalance(REGION_CODES, year, 'absolute');
    case 'Municipality': {
      const { codes, labels } = await getMunicipalityCodes();
      return fetchBalance(codes, year, 'absolute', labels);
    }
    default:
      throw new Error(`Elbalans: unsupported level "${level}"`);
  }
}

async function fetchKvot(level: AdminLevel, year: number): Promise<DatasetResult> {
  switch (level) {
    case 'Region':
      return fetchBalance(REGION_CODES, year, 'ratio');
    case 'Municipality': {
      const { codes, labels } = await getMunicipalityCodes();
      return fetchBalance(codes, year, 'ratio', labels);
    }
    default:
      throw new Error(`Elbalans: unsupported level "${level}"`);
  }
}

// ── Descriptors ──────────────────────────────────────────────────────────────

const SHARED = {
  category:        'energi' as const,
  source:          'SCB',
  group:           'elbalans',
  availableYears:  AVAILABLE_YEARS,
  supportedLevels: ['Region', 'Municipality'] as AdminLevel[],
  supportedViews:  ['map', 'chart', 'table'] as ViewType[],
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['diverging', 'histogram', 'boxplot'],
  } as DatasetDescriptor['chartTypes'],
};

export const elbalansAbsolut: DatasetDescriptor = {
  ...SHARED,
  id:              'elbalans-absolut',
  label:           'Elbalans',
  shortLabel:      'GWh',
  groupLabel:      'Elbalans',
  colorScaleType:  'diverging',
  divergingCenter: 0,
  fetch:           fetchAbsolut,
};

export const elbalansKvot: DatasetDescriptor = {
  ...SHARED,
  id:              'elbalans-kvot',
  label:           'Elbalans (kvot)',
  shortLabel:      'Kvot',
  colorScaleType:  'diverging',
  divergingCenter: 1,
  fetch:           fetchKvot,
};
