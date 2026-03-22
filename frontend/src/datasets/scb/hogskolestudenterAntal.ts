import { AdminLevel, DatasetDescriptor, DonutDatasetResult, TimeSeriesNode } from '../types';

// ── TAB5325 ───────────────────────────────────────────────────────────────────
// Same table as hogskolestudenter.ts — men + women summed per field.
// Snapshot → DonutDatasetResult. Time series → absolute student count per field.

const DATA_URL = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5325/data?outputFormat=json-stat2';

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
export const FIELD_COLORS: Record<string, string> = {
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
        { variableCode: 'UtbildnOmr',   valueCodes: FIELD_CODES              },
        { variableCode: 'Kon',          valueCodes: ['1', '2']                },
        { variableCode: 'ContentsCode', valueCodes: ['000003CJ']              },
        { variableCode: 'Tid',          valueCodes: schoolYears               },
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

// ── Snapshot ──────────────────────────────────────────────────────────────────

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

// ── Time series ───────────────────────────────────────────────────────────────

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

  // totals[fieldCode][schoolYear] = count
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

// ── Descriptor ────────────────────────────────────────────────────────────────

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
