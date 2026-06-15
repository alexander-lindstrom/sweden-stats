import { MetadataResponse, buildReverseIndex, buildStrides, parseScbValue, postScbQuery } from '@/util/jsonstat';
import { AdminLevel, DatasetDescriptor, DatasetResult, DonutDatasetResult, ScalarDatasetResult, TimeSeriesNode } from '../types';
import { stripCodePrefix } from '@/utils/labelFormatting';

// ── TAB3654 ──────────────────────────────────────────────────────────────────
// "Slutanvändning (MWh), efter län och kommun, förbrukarkategori samt
//  bränsletyp. År 2009–2024"
// Source: Energimyndigheten via SCB.

const DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3654/data?outputFormat=json-stat2';

const METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3654/metadata';

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

// ── Consumer category (Förbrukarkategori) ────────────────────────────────────

const CONSUMER_CODES = ['911', '921', '931', '941', '951', '98', '97', '964'];

const CONSUMER_LABELS: Record<string, string> = {
  '911': 'Jordbruk, skogsbruk, fiske',
  '921': 'Industri, byggverksamhet',
  '931': 'Offentlig verksamhet',
  '941': 'Transporter',
  '951': 'Övriga tjänster',
  '98':  'Småhus',
  '97':  'Flerbostadshus',
  '964': 'Fritidshus',
};

const CONSUMER_COLORS: Record<string, string> = {
  '911': '#22c55e', // green-500
  '921': '#6366f1', // indigo-500
  '931': '#0ea5e9', // sky-500
  '941': '#f43f5e', // rose-500
  '951': '#a855f7', // purple-500
  '98':  '#f59e0b', // amber-500
  '97':  '#14b8a6', // teal-500
  '964': '#78716c', // stone-500
};

// ── Fuel / energy type (Bränsletyp) ──────────────────────────────────────────

const FUEL_CODES = ['905', '910', '915', '920', '925', '930', '14', '16'];

const FUEL_LABELS: Record<string, string> = {
  '905': 'Flytande (ej förnybart)',
  '910': 'Fast (ej förnybart)',
  '915': 'Gas (ej förnybart)',
  '920': 'Flytande (förnybart)',
  '925': 'Fast (förnybart)',
  '930': 'Gas (förnybart)',
  '14':  'Fjärrvärme',
  '16':  'El',
};

const FUEL_COLORS: Record<string, string> = {
  '905': '#64748b', // slate-500
  '910': '#78716c', // stone-500
  '915': '#a1a1aa', // zinc-400
  '920': '#22c55e', // green-500
  '925': '#15803d', // green-700
  '930': '#86efac', // green-300
  '14':  '#f97316', // orange-500
  '16':  '#3b82f6', // blue-500
};

const FIRST_YEAR = 2009;
const LAST_YEAR  = 2024;
const AVAILABLE_YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// ── Municipality code cache ──────────────────────────────────────────────────

let municipalityCodeCache: { codes: string[]; labels: Record<string, string> } | null = null;

async function getMunicipalityCodes(): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (municipalityCodeCache) { return municipalityCodeCache; }

  const res = await fetch(METADATA_URL);
  if (!res.ok) { throw new Error(`TAB3654 metadata fetch failed: ${res.status}`); }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error('TAB3654: Region dimension not found'); }

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
// Fetches all consumer categories + "Totalt" with Bransle=['955'] (fuel total).
// Uses Totalt when available; falls back to summing individual categories when
// Totalt is null (SCB redacts the total when publishing it would reveal a
// redacted component).

async function fetchScalar(
  regionCodes: string[],
  year: number,
  externalLabels?: Record<string, string>,
): Promise<ScalarDatasetResult> {
  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',             valueCodes: regionCodes },
    { variableCode: 'Forbrukningskategri', valueCodes: [...CONSUMER_CODES, '999'] },
    { variableCode: 'Bransle',            valueCodes: ['955'] },
    { variableCode: 'ContentsCode',       valueCodes: ['EN0203AE'] },
    { variableCode: 'Tid',               valueCodes: [String(year)] },
  ]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const regionDimIdx = dimIds.indexOf('Region');
  const catDimIdx    = dimIds.indexOf('Forbrukningskategri');
  const regionDim    = data.dimension['Region'];
  const catDim       = data.dimension['Forbrukningskategri'];
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
      if (catCode === '999' && !(code in totals)) {
        totals[code] = null;
      }
      continue;
    }

    if (catCode === '999') {
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

  return { kind: 'scalar', values: gwh, labels, label: 'Energikonsumtion', unit: 'GWh' };
}

async function fetchByRegion(year: number): Promise<ScalarDatasetResult> {
  return fetchScalar(REGION_CODES, year);
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { codes, labels } = await getMunicipalityCodes();
  return fetchScalar(codes, year, labels);
}

// ── Fetch: Country donut ─────────────────────────────────────────────────────

async function fetchCountryDonut(year: number, breakdownId?: string): Promise<DonutDatasetResult> {
  const byFuel = breakdownId === 'fuel';

  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',             valueCodes: ['00'] },
    { variableCode: 'Forbrukningskategri', valueCodes: byFuel ? ['999'] : CONSUMER_CODES },
    { variableCode: 'Bransle',            valueCodes: byFuel ? FUEL_CODES : ['955'] },
    { variableCode: 'ContentsCode',       valueCodes: ['EN0203AE'] },
    { variableCode: 'Tid',               valueCodes: [String(year)] },
  ]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const breakDimName = byFuel ? 'Bransle' : 'Forbrukningskategri';
  const breakDimIdx  = dimIds.indexOf(breakDimName);
  const indexToBreak = buildReverseIndex(data.dimension[breakDimName].category);

  const codes  = byFuel ? FUEL_CODES  : CONSUMER_CODES;
  const lbls   = byFuel ? FUEL_LABELS : CONSUMER_LABELS;
  const colors = byFuel ? FUEL_COLORS : CONSUMER_COLORS;

  const totals: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const num = parseScbValue(data.value[i]);
    if (num === null) { continue; }

    const breakIdx = Math.floor(i / strides[breakDimIdx]) % sizes[breakDimIdx];
    const code = indexToBreak[breakIdx];
    if (code) { totals[code] = (totals[code] ?? 0) + num; }
  }

  const items = codes
    .filter(code => totals[code] !== undefined && totals[code] > 0)
    .map(code => ({
      code,
      label: lbls[code] ?? code,
      value: Math.round(totals[code] / 1000),
      color: colors[code] ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);

  const donutLabel = byFuel
    ? 'Energikonsumtion per bränsle'
    : 'Energikonsumtion per förbrukarkategori';

  return { kind: 'donut', items, label: donutLabel, unit: 'GWh' };
}

// ── Fetch: Time series ───────────────────────────────────────────────────────

async function fetchKonsumtionTimeSeries(
  _level: AdminLevel,
  _featureCode?: string,
  breakdownId?: string,
): Promise<TimeSeriesNode[]> {
  const byFuel = breakdownId === 'fuel';
  const yearCodes = AVAILABLE_YEARS.map(String);

  const data = await postScbQuery(DATA_URL, [
    { variableCode: 'Region',             valueCodes: ['00'] },
    { variableCode: 'Forbrukningskategri', valueCodes: byFuel ? ['999'] : CONSUMER_CODES },
    { variableCode: 'Bransle',            valueCodes: byFuel ? FUEL_CODES : ['955'] },
    { variableCode: 'ContentsCode',       valueCodes: ['EN0203AE'] },
    { variableCode: 'Tid',               valueCodes: yearCodes },
  ]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = buildStrides(sizes);

  const breakDimName = byFuel ? 'Bransle' : 'Forbrukningskategri';
  const breakDimIdx  = dimIds.indexOf(breakDimName);
  const tidDimIdx    = dimIds.indexOf('Tid');
  const indexToBreak = buildReverseIndex(data.dimension[breakDimName].category);
  const indexToTid   = buildReverseIndex(data.dimension['Tid'].category);

  const codes = byFuel ? FUEL_CODES  : CONSUMER_CODES;
  const lbls  = byFuel ? FUEL_LABELS : CONSUMER_LABELS;

  const totals: Record<string, Record<string, number>> = {};

  for (let i = 0; i < data.value.length; i++) {
    const num = parseScbValue(data.value[i]);
    if (num === null) { continue; }

    const breakCode = indexToBreak[Math.floor(i / strides[breakDimIdx]) % sizes[breakDimIdx]];
    const tidCode   = indexToTid[Math.floor(i / strides[tidDimIdx]) % sizes[tidDimIdx]];
    if (!breakCode || !tidCode) { continue; }

    if (!totals[breakCode]) { totals[breakCode] = {}; }
    totals[breakCode][tidCode] = (totals[breakCode][tidCode] ?? 0) + num;
  }

  return codes.filter(code => totals[code]).map(code => ({
    id:    code,
    label: lbls[code] ?? code,
    points: yearCodes
      .filter(y => totals[code][y] !== undefined)
      .map(y => ({ date: `${y}-01-01`, value: Math.round(totals[code][y] / 1000) })),
  }));
}

// ── Main fetch router ────────────────────────────────────────────────────────

async function fetchEnergikonsumtion(level: AdminLevel, year: number, breakdownId?: string): Promise<DatasetResult> {
  switch (level) {
    case 'Country':      return fetchCountryDonut(year, breakdownId);
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    default:             throw new Error(`Energikonsumtion: unsupported level "${level}"`);
  }
}

// ── Descriptor ───────────────────────────────────────────────────────────────

export const energikonsumtion: DatasetDescriptor = {
  id:              'energikonsumtion',
  label:           'Energikonsumtion',
  category:        'energi' as const,
  source:          'SCB',
  timeSeriesUnit:  'GWh',
  timeSeriesLabel: 'Energikonsumtion per förbrukarkategori',
  lineColors:      { ...CONSUMER_COLORS, ...FUEL_COLORS },
  breakdownOptions: [
    { id: 'consumer', label: 'Förbrukarkategori', timeSeriesLabel: 'Energikonsumtion per förbrukarkategori' },
    { id: 'fuel',     label: 'Bränsle/energislag', timeSeriesLabel: 'Energikonsumtion per bränsle' },
  ],
  defaultBreakdownId: 'consumer',
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
  fetch:           fetchEnergikonsumtion,
  fetchTimeSeries: fetchKonsumtionTimeSeries,
};
