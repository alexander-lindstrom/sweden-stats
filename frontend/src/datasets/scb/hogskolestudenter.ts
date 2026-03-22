import { AdminLevel, CategoryShare, CategoricalShareResult, DatasetDescriptor, DonutDatasetResult, TimeSeriesNode } from '../types';

// ── TAB5325 ───────────────────────────────────────────────────────────────────
// "Studenter i högskoleutbildning på grundnivå och avancerad nivå efter område"
// National only. Gender × field-of-study × academic year.
// ContentsCode 000003CJ = absolute count (antal). We compute % per field ourselves.

const DATA_URL = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5325/data?outputFormat=json-stat2';

// ── Shared constants ──────────────────────────────────────────────────────────

const FIELD_CODES = ['10', '20', '40', '45', '60', '70', '80', '999'];

const FIELD_LABELS: Record<string, string> = {
  '10':  'Humaniora & teologi',
  '20':  'Juridik & samhällsvet.',
  '40':  'Naturvetenskap',
  '45':  'Teknik',
  '60':  'Medicin & odontologi',
  '70':  'Vård & omsorg',
  '80':  'Konstnärligt',
  '999': 'Övrigt',
};

// d3.schemeTableau10 — cohesive, accessible categorical palette.
const FIELD_COLORS: Record<string, string> = {
  '10':  '#f28e2b', // orange  — Humaniora & teologi
  '20':  '#4e79a7', // blue    — Juridik & samhällsvet.
  '40':  '#76b7b2', // teal    — Naturvetenskap
  '45':  '#e15759', // red     — Teknik
  '60':  '#edc948', // yellow  — Medicin & odontologi
  '70':  '#59a14f', // green   — Vård & omsorg
  '80':  '#b07aa1', // purple  — Konstnärligt
  '999': '#bab0ac', // grey    — Övrigt (neutral "other")
};

const SCHOOL_YEARS = [
  '2007/08', '2008/09', '2009/10', '2010/11', '2011/12',
  '2012/13', '2013/14', '2014/15', '2015/16', '2016/17',
  '2017/18', '2018/19', '2019/20', '2020/21', '2021/22',
  '2022/23', '2023/24', '2024/25',
];

function yearToSchoolYear(year: number): string {
  return `${year - 1}/${String(year).slice(2)}`;
}

function schoolYearToDate(sy: string): string {
  return `${parseInt(sy.split('/')[0], 10) + 1}-01-01`;
}

// ── Shared fetch ──────────────────────────────────────────────────────────────

interface ScbResponse {
  id:        string[];
  size:      number[];
  value:     (number | null)[];
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
}

async function fetchRaw(schoolYears: string[]): Promise<ScbResponse> {
  const res = await fetch(DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'UtbildnOmr',   valueCodes: FIELD_CODES          },
        { variableCode: 'Kon',          valueCodes: ['1', '2']            },
        { variableCode: 'ContentsCode', valueCodes: ['000003CJ']          },
        { variableCode: 'Tid',          valueCodes: schoolYears           },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB5325 fetch failed: ${res.status}`); }
  return res.json();
}

function buildReverseIndex(cat: { index: Record<string, number> }): Record<number, string> {
  const map: Record<number, string> = {};
  for (const [code, idx] of Object.entries(cat.index)) { map[idx] = code; }
  return map;
}

// ── Constants for gender ──────────────────────────────────────────────────────

const MAN_CODE    = '1';
const KVINNA_CODE = '2';

const CATEGORIES: CategoryShare[] = [
  { code: MAN_CODE,    label: 'Män',     color: '#3b82f6' }, // blue-500
  { code: KVINNA_CODE, label: 'Kvinnor', color: '#f43f5e' }, // rose-500
];

// ── hogskolestudenterAntal: enrollment counts ─────────────────────────────────

async function fetchAntalSnapshot(year: number): Promise<DonutDatasetResult> {
  const schoolYear = yearToSchoolYear(year);
  const data       = await fetchRaw([schoolYear]);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const fieldDimIdx  = dimIds.indexOf('UtbildnOmr');
  const indexToField = buildReverseIndex(data.dimension['UtbildnOmr'].category);
  const totals: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }
    const fieldCode = indexToField[Math.floor(i / strides[fieldDimIdx]) % sizes[fieldDimIdx]];
    if (!fieldCode) { continue; }
    totals[fieldCode] = (totals[fieldCode] ?? 0) + num;
  }

  const items = FIELD_CODES
    .filter(fc => totals[fc] !== undefined)
    .map(fc => ({
      code:  fc,
      label: FIELD_LABELS[fc] ?? fc,
      value: totals[fc],
      color: FIELD_COLORS[fc] ?? '#bab0ac',
    }))
    // Largest first; Övrigt ('999') always last regardless of size.
    .sort((a, b) => {
      if (a.code === '999') { return 1; }
      if (b.code === '999') { return -1; }
      return b.value - a.value;
    });

  return { kind: 'donut', items, label: 'Högskolestudenter per område', unit: 'studenter' };
}

async function fetchAntalTimeSeries(): Promise<TimeSeriesNode[]> {
  const data = await fetchRaw(SCHOOL_YEARS);

  const dimIds  = data.id;
  const sizes   = data.size;
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const fieldDimIdx  = dimIds.indexOf('UtbildnOmr');
  const tidDimIdx    = dimIds.indexOf('Tid');
  const indexToField = buildReverseIndex(data.dimension['UtbildnOmr'].category);
  const indexToTid   = buildReverseIndex(data.dimension['Tid'].category);

  const totals: Record<string, Record<string, number>> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const fieldCode = indexToField[Math.floor(i / strides[fieldDimIdx]) % sizes[fieldDimIdx]];
    const sy        = indexToTid  [Math.floor(i / strides[tidDimIdx])   % sizes[tidDimIdx]];
    if (!fieldCode || !sy) { continue; }

    if (!totals[fieldCode]) { totals[fieldCode] = {}; }
    totals[fieldCode][sy] = (totals[fieldCode][sy] ?? 0) + num;
  }

  return FIELD_CODES.filter(fc => totals[fc]).map(fc => ({
    id:     fc,
    label:  FIELD_LABELS[fc] ?? fc,
    points: SCHOOL_YEARS
      .filter(sy => totals[fc][sy] !== undefined)
      .map(sy => ({ date: schoolYearToDate(sy), value: totals[fc][sy] })),
  }));
}

export const hogskolestudenterAntal: DatasetDescriptor = {
  id:             'hogskolestudenter-antal',
  label:          'Högskolestudenter',
  shortLabel:     'Antal',
  group:          'hogskolestudenter',
  groupLabel:     'Högskolestudenter',
  source:         'SCB',
  timeSeriesUnit:  'studenter',
  timeSeriesLabel: 'Antal studenter',
  lineColors:      FIELD_COLORS,
  availableYears:  Array.from({ length: 18 }, (_, i) => 2008 + i), // 2008–2025
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['donut', 'multiline'] },
  fetch:           (_level: AdminLevel, year: number) => fetchAntalSnapshot(year),
  fetchTimeSeries: () => fetchAntalTimeSeries(),
};

// ── hogskolestudenter: gender breakdown ───────────────────────────────────────

async function fetchSnapshot(year: number): Promise<CategoricalShareResult> {
  const schoolYear = yearToSchoolYear(year);
  const data       = await fetchRaw([schoolYear]);

  const dimIds = data.id;
  const sizes  = data.size;
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const fieldDimIdx = dimIds.indexOf('UtbildnOmr');
  const konDimIdx   = dimIds.indexOf('Kon');

  const indexToField = buildReverseIndex(data.dimension['UtbildnOmr'].category);
  const indexToKon   = buildReverseIndex(data.dimension['Kon'].category);

  const counts: Record<string, Record<string, number>> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const fieldCode = indexToField[Math.floor(i / strides[fieldDimIdx]) % sizes[fieldDimIdx]];
    const konCode   = indexToKon  [Math.floor(i / strides[konDimIdx])   % sizes[konDimIdx]];
    if (!fieldCode || !konCode) { continue; }

    if (!counts[fieldCode]) { counts[fieldCode] = {}; }
    counts[fieldCode][konCode] = (counts[fieldCode][konCode] ?? 0) + num;
  }

  const rows = FIELD_CODES.filter(fc => counts[fc]).map(fc => {
    const men   = counts[fc][MAN_CODE]    ?? 0;
    const women = counts[fc][KVINNA_CODE] ?? 0;
    const total = men + women;
    const shares: Record<string, number> = total > 0
      ? {
          [MAN_CODE]:    Math.round(men   / total * 1000) / 10,
          [KVINNA_CODE]: Math.round(women / total * 1000) / 10,
        }
      : {};
    return { code: fc, label: FIELD_LABELS[fc] ?? fc, shares };
  });

  return { kind: 'categorical-share', categories: CATEGORIES, rows, label: 'Könsfördelning', unit: '%' };
}

async function fetchGenderTimeSeries(): Promise<TimeSeriesNode[]> {
  const data = await fetchRaw(SCHOOL_YEARS);

  const dimIds = data.id;
  const sizes  = data.size;
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const fieldDimIdx = dimIds.indexOf('UtbildnOmr');
  const konDimIdx   = dimIds.indexOf('Kon');
  const tidDimIdx   = dimIds.indexOf('Tid');

  const indexToField = buildReverseIndex(data.dimension['UtbildnOmr'].category);
  const indexToKon   = buildReverseIndex(data.dimension['Kon'].category);
  const indexToTid   = buildReverseIndex(data.dimension['Tid'].category);

  // counts[fieldCode][schoolYear][konCode] = count
  const counts: Record<string, Record<string, Record<string, number>>> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const fieldCode = indexToField[Math.floor(i / strides[fieldDimIdx]) % sizes[fieldDimIdx]];
    const konCode   = indexToKon  [Math.floor(i / strides[konDimIdx])   % sizes[konDimIdx]];
    const sy        = indexToTid  [Math.floor(i / strides[tidDimIdx])   % sizes[tidDimIdx]];
    if (!fieldCode || !konCode || !sy) { continue; }

    if (!counts[fieldCode])      { counts[fieldCode] = {}; }
    if (!counts[fieldCode][sy])  { counts[fieldCode][sy] = {}; }
    counts[fieldCode][sy][konCode] = (counts[fieldCode][sy][konCode] ?? 0) + num;
  }

  return FIELD_CODES.filter(fc => counts[fc]).map(fc => {
    const points = SCHOOL_YEARS
      .filter(sy => counts[fc][sy])
      .map(sy => {
        const men   = counts[fc][sy][MAN_CODE]    ?? 0;
        const women = counts[fc][sy][KVINNA_CODE] ?? 0;
        const total = men + women;
        if (total === 0) { return null; }
        return { date: schoolYearToDate(sy), value: Math.round(women / total * 1000) / 10 };
      })
      .filter((p): p is { date: string; value: number } => p !== null);

    return { id: fc, label: FIELD_LABELS[fc] ?? fc, points };
  });
}

export const hogskolestudenter: DatasetDescriptor = {
  id:             'hogskolestudenter',
  label:          'Högskolestudenter – kön',
  shortLabel:     'Kön',
  group:          'hogskolestudenter',
  source:         'SCB',
  timeSeriesUnit:  '%',
  timeSeriesLabel: 'Andel kvinnor',
  availableYears: Array.from({ length: 18 }, (_, i) => 2008 + i), // 2008–2025
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['share-bar', 'multiline'] },
  fetch:           (_level: AdminLevel, year: number) => fetchSnapshot(year),
  fetchTimeSeries: () => fetchGenderTimeSeries(),
};
