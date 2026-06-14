import { JsonStat2Response } from '@/util/scb';
import { MetadataResponse, buildReverseIndex, buildStrides, parseScbValue, postScbQuery } from '@/util/jsonstat';
import { AdminLevel, DatasetDescriptor, DatasetResult, DonutDatasetResult, ScalarDatasetResult, TimeSeriesNode } from '../types';
import { stripCodePrefix } from '@/utils/labelFormatting';

// ── TAB3451 ──────────────────────────────────────────────────────────────────
// "Elproduktion och bränsleanvändning (MWh), efter län och kommun,
//  produktionssätt samt bränsletyp. År 2009–2024"
// Source: Energimyndigheten via SCB.

const DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3451/data?outputFormat=json-stat2';

const METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3451/metadata';

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

const PRODUCTION_CODES = ['4.1', '4.2', '4.7', '4.5+4.6', '4.3+4.4'];

const PRODUCTION_LABELS: Record<string, string> = {
  '4.1':     'Vattenkraft',
  '4.2':     'Vindkraft',
  '4.7':     'Solkraft',
  '4.5+4.6': 'Kraftvärme',
  '4.3+4.4': 'Kärnkraft m.fl.',
};

const PRODUCTION_COLORS: Record<string, string> = {
  '4.1':     '#3b82f6', // blue-500 (hydro)
  '4.2':     '#06b6d4', // cyan-500 (wind)
  '4.7':     '#f59e0b', // amber-500 (solar)
  '4.5+4.6': '#f97316', // orange-500 (CHP)
  '4.3+4.4': '#8b5cf6', // violet-500 (nuclear)
};

const FIRST_YEAR = 2009;
const LAST_YEAR  = 2024;
const AVAILABLE_YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// ── Municipality code cache ──────────────────────────────────────────────────

let municipalityCodeCache: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCodeCache) { return municipalityCodeCache; }

  const res = await fetch(METADATA_URL);
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

// ── Shared scalar aggregation ─────────────────────────────────────────────────
// Uses the SCB "Totalt" row when available; falls back to summing individual
// production types when Totalt is null (happens when SCB redacts a component
// and publishing the total would reveal it).

function aggregateScalar(
  data: JsonStat2Response,
  externalLabels?: Record<string, string>,
): ScalarDatasetResult {
  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const regionDimIdx = dimIds.indexOf('Region');
  const prodDimIdx   = dimIds.indexOf('Produktionssatt');
  const regionDim    = data.dimension['Region'];
  const prodDim      = data.dimension['Produktionssatt'];
  const indexToRegion = buildReverseIndex(regionDim.category);
  const indexToProd   = buildReverseIndex(prodDim.category);

  const totals: Record<string, number | null>   = {};
  const partials: Record<string, number> = {};
  const labels: Record<string, string>   = {};

  for (let i = 0; i < data.value.length; i++) {
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const prodIdx   = Math.floor(i / strides[prodDimIdx])   % sizes[prodDimIdx];
    const code      = indexToRegion[regionIdx];
    const prodCode  = indexToProd[prodIdx];
    if (!code || !prodCode) { continue; }

    if (!labels[code]) {
      labels[code] = externalLabels?.[code]
        ?? stripCodePrefix(regionDim.category.label[code] ?? code);
    }

    const num = parseScbValue(data.value[i]);
    if (num === null) {
      if (prodCode === 'Totalt' && !(code in totals)) {
        totals[code] = null;
      }
      continue;
    }

    if (prodCode === 'Totalt') {
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

  const gwh: Record<string, number> = {};
  for (const [code, mwh] of Object.entries(values)) {
    gwh[code] = Math.round(mwh / 1000);
  }

  return { kind: 'scalar', values: gwh, labels, label: 'Elproduktion', unit: 'GWh' };
}

// ── Fetch: Scalar (shared by Region + Municipality) ──────────────────────────

async function fetchScalar(
  regionCodes: string[],
  year: number,
  externalLabels?: Record<string, string>,
): Promise<ScalarDatasetResult> {
  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',          valueCodes: regionCodes },
    { variableCode: 'Produktionssatt', valueCodes: [...PRODUCTION_CODES, 'Totalt'] },
    { variableCode: 'Bransle',         valueCodes: ['17'] },
    { variableCode: 'ContentsCode',    valueCodes: ['EN0203AD'] },
    { variableCode: 'Tid',             valueCodes: [String(year)] },
  ]);
  return aggregateScalar(data, externalLabels);
}

async function fetchByRegion(year: number): Promise<ScalarDatasetResult> {
  return fetchScalar(REGION_CODES, year);
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { codes, labels } = await getMunicipalityCodes();
  return fetchScalar(codes, year, labels);
}

// ── Fetch: Country donut (breakdown by production type) ──────────────────────

async function fetchCountryDonut(year: number): Promise<DonutDatasetResult> {
  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',          valueCodes: ['00'] },
    { variableCode: 'Produktionssatt', valueCodes: PRODUCTION_CODES },
    { variableCode: 'Bransle',         valueCodes: ['17'] },
    { variableCode: 'ContentsCode',    valueCodes: ['EN0203AD'] },
    { variableCode: 'Tid',             valueCodes: [String(year)] },
  ]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const prodDimIdx  = dimIds.indexOf('Produktionssatt');
  const indexToProd = buildReverseIndex(data.dimension['Produktionssatt'].category);

  const totals: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const num = parseScbValue(data.value[i]);
    if (num === null) { continue; }

    const prodIdx = Math.floor(i / strides[prodDimIdx]) % sizes[prodDimIdx];
    const code = indexToProd[prodIdx];
    if (code) { totals[code] = (totals[code] ?? 0) + num; }
  }

  const items = PRODUCTION_CODES
    .filter(code => totals[code] !== undefined && totals[code] > 0)
    .map(code => ({
      code,
      label: PRODUCTION_LABELS[code] ?? code,
      value: Math.round(totals[code] / 1000),
      color: PRODUCTION_COLORS[code] ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

  return { kind: 'donut', items, label: 'Elproduktion per kraftslag', unit: 'GWh' };
}

// ── Fetch: Time series (national, by production type) ────────────────────────

async function fetchElproduktionTimeSeries(): Promise<TimeSeriesNode[]> {
  const yearCodes = AVAILABLE_YEARS.map(String);

  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',          valueCodes: ['00'] },
    { variableCode: 'Produktionssatt', valueCodes: PRODUCTION_CODES },
    { variableCode: 'Bransle',         valueCodes: ['17'] },
    { variableCode: 'ContentsCode',    valueCodes: ['EN0203AD'] },
    { variableCode: 'Tid',             valueCodes: yearCodes },
  ]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const prodDimIdx  = dimIds.indexOf('Produktionssatt');
  const tidDimIdx   = dimIds.indexOf('Tid');
  const indexToProd = buildReverseIndex(data.dimension['Produktionssatt'].category);
  const indexToTid  = buildReverseIndex(data.dimension['Tid'].category);

  const totals: Record<string, Record<string, number>> = {};

  for (let i = 0; i < data.value.length; i++) {
    const num = parseScbValue(data.value[i]);
    if (num === null) { continue; }

    const prodCode = indexToProd[Math.floor(i / strides[prodDimIdx]) % sizes[prodDimIdx]];
    const tidCode  = indexToTid[Math.floor(i / strides[tidDimIdx]) % sizes[tidDimIdx]];
    if (!prodCode || !tidCode) { continue; }

    if (!totals[prodCode]) { totals[prodCode] = {}; }
    totals[prodCode][tidCode] = (totals[prodCode][tidCode] ?? 0) + num;
  }

  return PRODUCTION_CODES.filter(code => totals[code]).map(code => ({
    id:    code,
    label: PRODUCTION_LABELS[code] ?? code,
    points: yearCodes
      .filter(y => totals[code][y] !== undefined)
      .map(y => ({ date: `${y}-01-01`, value: Math.round(totals[code][y] / 1000) })),
  }));
}

// ── Main fetch router ────────────────────────────────────────────────────────

async function fetchElproduktion(level: AdminLevel, year: number): Promise<DatasetResult> {
  switch (level) {
    case 'Country':      return fetchCountryDonut(year);
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    default:             throw new Error(`Elproduktion: unsupported level "${level}"`);
  }
}

// ── Descriptor ───────────────────────────────────────────────────────────────

export const elproduktion: DatasetDescriptor = {
  id:              'elproduktion',
  label:           'Elproduktion',
  category:        'energi' as const,
  source:          'SCB',
  timeSeriesUnit:  'GWh',
  timeSeriesLabel: 'Elproduktion per kraftslag',
  lineColors:      PRODUCTION_COLORS,
  availableYears:  AVAILABLE_YEARS,
  supportedLevels: ['Country', 'Region', 'Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    Country: ['chart'],
  },
  chartTypes: {
    Country:      ['donut', 'multiline'],
    Region:       ['bar', 'diverging', 'histogram', 'scatter'],
    Municipality: ['diverging', 'histogram', 'scatter', 'boxplot'],
  },
  fetch:           fetchElproduktion,
  fetchTimeSeries: fetchElproduktionTimeSeries,
};
