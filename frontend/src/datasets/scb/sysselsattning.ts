import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { getGeoLabels } from '../geoLabels';

// ── TAB2921 — Region / Municipality ──────────────────────────────────────────
// "Arbetsmarknadsstatus efter region, kön, ålder och födelseregion.
//  Slutlig statistik. År 2020–2024"
// Has county (2-digit) + municipality (4-digit) codes.
// ContentsCode '000001PL' = sysselsättningsgrad % — returned directly, no ratio needed.

const TAB2921_DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB2921/data?outputFormat=json-stat2';

const TAB2921_METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB2921/metadata';

// ── TAB6680 — RegSO / DeSO ────────────────────────────────────────────────────
// "Arbetsmarknadsstatus efter bostadens belägenhet, region (DeSO/RegSO),
//  kön och ålder. Årligt register. År 2020–2024"
// ContentsCode '0000089X' = sysselsatta, '0000089Y' = totalt → compute ratio.

const TAB6680_DATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6680/data?outputFormat=json-stat2';

const TAB6680_METADATA_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB6680/metadata';

// ── Shared types ──────────────────────────────────────────────────────────────

interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

// ── TAB2921 code cache ────────────────────────────────────────────────────────

interface RegMuniCache {
  countyCodes:        string[];
  municipalityCodes:  string[];
  countyLabels:       Record<string, string>;
  municipalityLabels: Record<string, string>;
}

let tab2921Cache: RegMuniCache | null = null;

async function getRegMuniCodes(): Promise<RegMuniCache> {
  if (tab2921Cache) { return tab2921Cache; }

  const res = await fetch(TAB2921_METADATA_URL);
  if (!res.ok) { throw new Error(`TAB2921 metadata fetch failed: ${res.status}`); }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error('TAB2921: Region dimension not found'); }

  const countyCodes:        string[] = [];
  const municipalityCodes:  string[] = [];
  const countyLabels:       Record<string, string> = {};
  const municipalityLabels: Record<string, string> = {};

  for (const code of Object.keys(regionCat.index)) {
    if (code === '00') { continue; }
    const label = regionCat.label[code] ?? code;
    if (code.length === 2) {
      countyCodes.push(code);
      countyLabels[code] = label.replace(/^\d+\s+/, ''); // strip "01 " prefix
    } else if (code.length === 4) {
      municipalityCodes.push(code);
      municipalityLabels[code] = label.replace(/^\d+\s+/, '');
    }
  }

  tab2921Cache = { countyCodes, municipalityCodes, countyLabels, municipalityLabels };
  return tab2921Cache;
}

// ── TAB6680 code cache ────────────────────────────────────────────────────────

interface RegsoDesoCache {
  regsoCodes: string[];
  desoCodes:  string[];
}

let tab6680Cache: RegsoDesoCache | null = null;

async function getRegsoDeso(): Promise<RegsoDesoCache> {
  if (tab6680Cache) { return tab6680Cache; }

  const res = await fetch(TAB6680_METADATA_URL);
  if (!res.ok) { throw new Error(`TAB6680 metadata fetch failed: ${res.status}`); }

  const metadata: MetadataResponse = await res.json();
  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error('TAB6680: Region dimension not found'); }

  const regsoCodes: string[] = [];
  const desoCodes:  string[] = [];

  for (const code of Object.keys(regionCat.index)) {
    if      (code.includes('_RegSO')) { regsoCodes.push(code); }
    else if (code.includes('_DeSO'))  { desoCodes.push(code); }
  }

  tab6680Cache = { regsoCodes, desoCodes };
  return tab6680Cache;
}

// ── JSON-stat2 helpers ────────────────────────────────────────────────────────

/** Extract one value per region from a response where Region is the only varying dimension. */
function extractByRegion(
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
  if (regionDimIdx === -1) { throw new Error('SCB response missing Region dimension'); }

  const regionDim = data.dimension['Region'];
  const indexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToCode[idx as number] = code;
  }

  const values: Record<string, number> = {};
  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }
    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const code = indexToCode[regionIdx];
    if (code) { values[code] = num; }
  }

  const responseLabels = { ...regionDim.category.label } as Record<string, string>;
  const labels = externalLabels ? { ...externalLabels, ...responseLabels } : responseLabels;
  return { values, labels };
}

/** Compute employment rate % from a Region × ContentsCode response (TAB6680). */
function computeEmploymentRate(
  data: JsonStat2Response,
): { values: Record<string, number>; labels: Record<string, string> } {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx   = dimIds.indexOf('Region');
  const contentsDimIdx = dimIds.indexOf('ContentsCode');
  if (regionDimIdx === -1 || contentsDimIdx === -1) {
    throw new Error('TAB6680: missing Region or ContentsCode dimension');
  }

  const regionDim   = data.dimension['Region'];
  const contentsDim = data.dimension['ContentsCode'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  const employedIdx = contentsDim.category.index['0000089X'] ?? -1;
  const totalIdx    = contentsDim.category.index['0000089Y'] ?? -1;

  const employed: Record<string, number> = {};
  const total:    Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx = Math.floor(i / strides[regionDimIdx])   % sizes[regionDimIdx];
    const cIdx      = Math.floor(i / strides[contentsDimIdx]) % sizes[contentsDimIdx];
    const code      = indexToRegion[regionIdx];
    if (!code) { continue; }

    if (cIdx === employedIdx) { employed[code] = (employed[code] ?? 0) + num; }
    if (cIdx === totalIdx)    { total[code]    = (total[code]    ?? 0) + num; }
  }

  const values: Record<string, number> = {};
  for (const [code, emp] of Object.entries(employed)) {
    const tot = total[code];
    if (tot > 0) { values[code] = Math.round((emp / tot) * 1000) / 10; }
  }

  const labels = { ...regionDim.category.label } as Record<string, string>;
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
  const { countyCodes, countyLabels } = await getRegMuniCodes();
  const res = await fetch(TAB2921_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',        valueCodes: countyCodes      },
        { variableCode: 'Kon',           valueCodes: ['1+2']          },
        { variableCode: 'Alder',         valueCodes: ['20-64']        },
        { variableCode: 'Fodelseregion', valueCodes: ['tot']          },
        { variableCode: 'ContentsCode',  valueCodes: ['000001PL']     },
        { variableCode: 'Tid',           valueCodes: [String(year)]   },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB2921 region fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values } = extractByRegion(data);
  return { kind: 'scalar', values, labels: countyLabels, label: 'Sysselsättning 20–64', unit: '%' };
}

async function fetchByMunicipality(year: number): Promise<ScalarDatasetResult> {
  const { municipalityCodes, municipalityLabels } = await getRegMuniCodes();
  const res = await fetch(TAB2921_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',        valueCodes: municipalityCodes },
        { variableCode: 'Kon',           valueCodes: ['1+2']           },
        { variableCode: 'Alder',         valueCodes: ['20-64']         },
        { variableCode: 'Fodelseregion', valueCodes: ['tot']           },
        { variableCode: 'ContentsCode',  valueCodes: ['000001PL']      },
        { variableCode: 'Tid',           valueCodes: [String(year)]    },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB2921 municipality fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values } = extractByRegion(data);
  return { kind: 'scalar', values, labels: municipalityLabels, label: 'Sysselsättning 20–64', unit: '%' };
}

async function fetchByRegso(year: number): Promise<ScalarDatasetResult> {
  const [{ regsoCodes }, { municipalityLabels }, geoLabels] = await Promise.all([
    getRegsoDeso(),
    getRegMuniCodes(),
    getGeoLabels('regso'),
  ]);
  const res = await fetch(TAB6680_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: regsoCodes                   },
        { variableCode: 'Kon',          valueCodes: ['1+2']                      },
        { variableCode: 'Alder',        valueCodes: ['20-64']                    },
        { variableCode: 'ContentsCode', valueCodes: ['0000089X', '0000089Y']     },
        { variableCode: 'Tid',          valueCodes: [String(year)]               },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB6680 RegSO fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values, labels } = stripSuffixes(computeEmploymentRate(data));
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Sysselsättning 20–64', unit: '%',
    parentLabels: municipalityLabels,
  };
}

async function fetchByDeso(year: number): Promise<ScalarDatasetResult> {
  const [{ desoCodes }, { municipalityLabels }, geoLabels] = await Promise.all([
    getRegsoDeso(),
    getRegMuniCodes(),
    getGeoLabels('deso'),
  ]);
  const res = await fetch(TAB6680_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'Region',       valueCodes: desoCodes                    },
        { variableCode: 'Kon',          valueCodes: ['1+2']                      },
        { variableCode: 'Alder',        valueCodes: ['20-64']                    },
        { variableCode: 'ContentsCode', valueCodes: ['0000089X', '0000089Y']     },
        { variableCode: 'Tid',          valueCodes: [String(year)]               },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB6680 DeSO fetch failed: ${res.status}`); }
  const data: JsonStat2Response = await res.json();
  const { values, labels } = stripSuffixes(computeEmploymentRate(data));
  return {
    kind: 'scalar', values,
    labels: { ...labels, ...geoLabels },
    label: 'Sysselsättning 20–64', unit: '%',
    parentLabels: municipalityLabels,
  };
}

// ── Descriptor ────────────────────────────────────────────────────────────────

async function fetchSysselsattning(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  switch (level) {
    case 'Region':       return fetchByRegion(year);
    case 'Municipality': return fetchByMunicipality(year);
    case 'RegSO':        return fetchByRegso(year);
    case 'DeSO':         return fetchByDeso(year);
    default: throw new Error(`Sysselsättning: unsupported level "${level}"`);
  }
}

export const sysselsattning: DatasetDescriptor = {
  id: 'sysselsattning',
  label: 'Sysselsättning',
  source: 'SCB',
  availableYears: [2020, 2021, 2022, 2023, 2024],
  supportedLevels: ['Region', 'Municipality', 'RegSO', 'DeSO'],
  supportedViews: ['map', 'chart', 'table'],
  supportedViewsByLevel: {
    RegSO: ['map', 'chart', 'table'],
    DeSO:  ['map', 'chart', 'table'],
  },
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram', 'scatter'],
    Municipality: ['diverging', 'histogram', 'scatter'],
    RegSO:        ['diverging', 'histogram', 'scatter'],
    DeSO:         ['diverging', 'histogram', 'scatter'],
  },
  fetch: fetchSysselsattning,
};
