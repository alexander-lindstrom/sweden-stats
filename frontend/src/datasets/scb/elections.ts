import {
  AdminLevel, DatasetDescriptor, ElectionDatasetResult, TimeSeriesNode,
} from '../types';
import { ELECTION_YEARS, PARTY_CODES, PARTY_COLORS, PARTY_LABELS, normalizePartyCode } from '../parties';
import { COUNTY_NAMES } from '../adminLevels';

// ── SCB v2beta table IDs ──────────────────────────────────────────────────────
// All fetched directly from the browser — v2beta has CORS enabled, no proxy needed.
// TAB2706 = riksdag, TAB2697 = regionval, TAB2685 = kommunval
const RIKSDAG_TABLE = 'TAB2706';
const REGION_TABLE  = 'TAB2697';
const KOMMUN_TABLE  = 'TAB2685';

// Content codes: antal röster (vote counts), used for aggregating to county/national level.
const COUNT_CODE_RIKSDAG = 'ME0104B6';
const COUNT_CODE_REGION  = 'ME0104B4';
const COUNT_CODE_KOMMUN  = 'ME0104B1';

// Party codes as known to SCB. FP is normalised → L via normalizePartyCode.
const SCB_PARTY_CODES = ['S', 'M', 'SD', 'C', 'V', 'KD', 'MP', 'FP', 'ÖVRIGA'];

// County (2-digit) codes for the 21 Swedish läns.
const COUNTY_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function nearestElectionYear(year: number): number {
  return ELECTION_YEARS.reduce((prev, curr) =>
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev,
  );
}

// ── v2beta fetch helpers ──────────────────────────────────────────────────────

function dataUrl(tableId: string): string {
  return `https://api.scb.se/OV0104/v2beta/api/v2/tables/${tableId}/data?outputFormat=json-stat2`;
}

function metaUrl(tableId: string): string {
  return `https://api.scb.se/OV0104/v2beta/api/v2/tables/${tableId}/metadata`;
}

interface JsonStat2 {
  id:        string[];
  size:      number[];
  value:     (number | null)[];
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
}

interface MetadataResponse {
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
}

async function postQuery(
  tableId: string,
  selection: Array<{ variableCode: string; valueCodes: string[] }>,
): Promise<JsonStat2> {
  const res = await fetch(dataUrl(tableId), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ selection }),
  });
  if (!res.ok) { throw new Error(`SCB v2beta ${tableId}: ${res.status} ${res.statusText}`); }
  return res.json();
}

// ── Municipality code cache (per table) ──────────────────────────────────────

const muniCodeCache: Record<string, { codes: string[]; labels: Record<string, string> }> = {};

async function getMuniCodes(
  tableId: string,
): Promise<{ codes: string[]; labels: Record<string, string> }> {
  if (muniCodeCache[tableId]) { return muniCodeCache[tableId]; }

  const res = await fetch(metaUrl(tableId));
  if (!res.ok) { throw new Error(`SCB metadata ${tableId}: ${res.status}`); }
  const metadata: MetadataResponse = await res.json();

  const regionCat = metadata.dimension['Region']?.category;
  if (!regionCat) { throw new Error(`SCB metadata ${tableId}: Region dimension not found`); }

  const codes: string[]                = [];
  const labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(regionCat.label)) {
    // Municipality codes are exactly 4 digits; TAB2706 also contains VR-prefix valkrets entries.
    if (code.length === 4 && !/^VR/i.test(code)) {
      codes.push(code);
      labels[code] = label;
    }
  }

  muniCodeCache[tableId] = { codes, labels };
  return muniCodeCache[tableId];
}

// ── JSON-stat2 parser ─────────────────────────────────────────────────────────

function parseElectionResponse(
  data: JsonStat2,
): { counts: Record<string, Record<string, number>>; labels: Record<string, string> } {
  const { id: dimIds, size: sizes, value, dimension } = data;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const partyDimIdx  = dimIds.indexOf('Partimm');
  if (regionDimIdx === -1 || partyDimIdx === -1) {
    throw new Error(`SCB election response missing expected dimensions. Got: ${dimIds.join(', ')}`);
  }

  const regionDim = dimension['Region'];
  const partyDim  = dimension['Partimm'];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }
  const indexToParty: Record<number, string> = {};
  for (const [code, idx] of Object.entries(partyDim.category.index)) {
    indexToParty[idx as number] = normalizePartyCode(code);
  }

  const counts: Record<string, Record<string, number>> = {};
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx  = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const partyIdx   = Math.floor(i / strides[partyDimIdx])  % sizes[partyDimIdx];
    const regionCode = indexToRegion[regionIdx];
    const partyCode  = indexToParty[partyIdx];

    if (!regionCode || !partyCode) { continue; }
    if (!counts[regionCode]) { counts[regionCode] = {}; }
    counts[regionCode][partyCode] = (counts[regionCode][partyCode] ?? 0) + num;
  }

  return { counts, labels: { ...regionDim.category.label } };
}

// ── Build ElectionDatasetResult from raw counts ───────────────────────────────

function buildElectionResult(
  counts:       Record<string, Record<string, number>>,
  labels:       Record<string, string>,
  label:        string,
  electionType: ElectionDatasetResult['electionType'],
): ElectionDatasetResult {
  const partyVotes:  Record<string, Record<string, number>> = {};
  const winnerByGeo: Record<string, string>                 = {};

  for (const [geoCode, partyCounts] of Object.entries(counts)) {
    const total = Object.values(partyCounts).reduce((s, v) => s + v, 0);
    if (total === 0) { continue; }

    const shares: Record<string, number> = {};
    let winnerCode  = '';
    let winnerShare = -1;

    for (const [party, count] of Object.entries(partyCounts)) {
      const share = (count / total) * 100;
      shares[party] = Math.round(share * 10) / 10;
      if (share > winnerShare) { winnerShare = share; winnerCode = party; }
    }

    partyVotes[geoCode]  = shares;
    winnerByGeo[geoCode] = winnerCode;
  }

  return { kind: 'election', partyVotes, winnerByGeo, labels, label, unit: '%', electionType };
}

// ── DeSO / RegSO fetch (backend static JSON) ──────────────────────────────────

const BACKEND = 'http://localhost:3001';

async function fetchDesoRegsoLevel(
  electionId:   string,
  level:        'DeSO' | 'RegSO',
  year:         number,
): Promise<ElectionDatasetResult> {
  // Only 2022 data exists; snap to nearest supported year (2022) when more are added.
  const supportedYear = 2022;
  void year; // year parameter reserved for future multi-year support
  const levelParam = level === 'DeSO' ? 'deso' : 'regso';
  const url = `${BACKEND}/api/election-geodata/${electionId}/${supportedYear}/${levelParam}`;
  const res = await fetch(url);
  if (!res.ok) { throw new Error(`Election geodata ${url}: ${res.status} ${res.statusText}`); }
  const raw = await res.json() as Omit<ElectionDatasetResult, 'kind'>;
  return { kind: 'election', ...raw };
}

// ── Core municipality data fetch ──────────────────────────────────────────────

/**
 * Fetch vote counts for all municipalities in a table for a single year.
 * Metadata labels are used (already clean, no valkrets suffixes).
 */
async function fetchMuniData(
  tableId:     string,
  contentCode: string,
  year:        number,
): Promise<{ counts: Record<string, Record<string, number>>; labels: Record<string, string> }> {
  const electionYear         = nearestElectionYear(year);
  const { codes, labels }    = await getMuniCodes(tableId);

  const raw = await postQuery(tableId, [
    { variableCode: 'Region',       valueCodes: codes },
    { variableCode: 'Partimm',      valueCodes: SCB_PARTY_CODES },
    { variableCode: 'ContentsCode', valueCodes: [contentCode] },
    { variableCode: 'Tid',          valueCodes: [String(electionYear)] },
  ]);

  const { counts } = parseElectionResponse(raw);
  return { counts, labels };
}

// ── Fetch by level ────────────────────────────────────────────────────────────

async function fetchCountryLevel(
  tableId:      string,
  contentCode:  string,
  year:         number,
  label:        string,
  electionType: ElectionDatasetResult['electionType'],
): Promise<ElectionDatasetResult> {
  const { counts: muniCounts, labels: muniLabels } = await fetchMuniData(tableId, contentCode, year);

  const national: Record<string, number> = {};
  for (const partyCounts of Object.values(muniCounts)) {
    for (const [party, count] of Object.entries(partyCounts)) {
      national[party] = (national[party] ?? 0) + count;
    }
  }

  return buildElectionResult({ SE: national }, { SE: 'Sverige', ...muniLabels }, label, electionType);
}

async function fetchRegionLevel(
  tableId:      string,
  contentCode:  string,
  year:         number,
  label:        string,
  electionType: ElectionDatasetResult['electionType'],
): Promise<ElectionDatasetResult> {
  const { counts: muniCounts } = await fetchMuniData(tableId, contentCode, year);

  const countyCounts: Record<string, Record<string, number>> = {};
  for (const code of COUNTY_CODES) { countyCounts[code] = {}; }

  for (const [muniCode, partyCounts] of Object.entries(muniCounts)) {
    const countyCode = muniCode.slice(0, 2);
    if (!countyCounts[countyCode]) { continue; }
    for (const [party, count] of Object.entries(partyCounts)) {
      countyCounts[countyCode][party] = (countyCounts[countyCode][party] ?? 0) + count;
    }
  }

  const countyLabels: Record<string, string> = {};
  for (const code of COUNTY_CODES) { countyLabels[code] = COUNTY_NAMES[code] ?? code; }

  return buildElectionResult(countyCounts, countyLabels, label, electionType);
}

async function fetchMunicipalityLevel(
  tableId:      string,
  contentCode:  string,
  year:         number,
  label:        string,
  electionType: ElectionDatasetResult['electionType'],
): Promise<ElectionDatasetResult> {
  const { counts, labels } = await fetchMuniData(tableId, contentCode, year);
  return buildElectionResult(counts, labels, label, electionType);
}

// ── Time series ───────────────────────────────────────────────────────────────

/**
 * Fetch party vote-share time series across all election years.
 * If areaCode is provided (2-digit county or 4-digit municipality), the series
 * is scoped to that area; otherwise a national aggregate is returned.
 */
async function fetchElectionTimeSeries(
  tableId:     string,
  contentCode: string,
  areaCode?:   string,
): Promise<TimeSeriesNode[]> {
  const { codes } = await getMuniCodes(tableId);

  const raw = await postQuery(tableId, [
    { variableCode: 'Region',       valueCodes: codes },
    { variableCode: 'Partimm',      valueCodes: SCB_PARTY_CODES },
    { variableCode: 'ContentsCode', valueCodes: [contentCode] },
    { variableCode: 'Tid',          valueCodes: ELECTION_YEARS.map(String) },
  ]);

  const { id: dimIds, size: sizes, value, dimension } = raw;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  const partyDimIdx  = dimIds.indexOf('Partimm');
  const yearDimIdx   = dimIds.indexOf('Tid');
  if (regionDimIdx === -1 || partyDimIdx === -1 || yearDimIdx === -1) {
    throw new Error(`Time series: missing dimensions. Got: ${dimIds.join(', ')}`);
  }

  const regionIndexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(dimension['Region'].category.index)) {
    regionIndexToCode[idx as number] = code;
  }
  const partyIndexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(dimension['Partimm'].category.index)) {
    partyIndexToCode[idx as number] = normalizePartyCode(code);
  }
  const yearCodes = Object.keys(dimension['Tid'].category.index).sort(
    (a, b) => dimension['Tid'].category.index[a] - dimension['Tid'].category.index[b],
  );

  // Accumulate counts: yearCode → partyCode → total
  const yearPartyCount: Record<string, Record<string, number>> = {};
  for (const yr of yearCodes) { yearPartyCount[yr] = {}; }

  for (let i = 0; i < value.length; i++) {
    const val = value[i];
    if (val === null || val === undefined) { continue; }
    const num = typeof val === 'number' ? val : parseFloat(val as string);
    if (isNaN(num) || num === 0) { continue; }

    const regionIdx  = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const partyIdx   = Math.floor(i / strides[partyDimIdx])  % sizes[partyDimIdx];
    const yearIdx    = Math.floor(i / strides[yearDimIdx])   % sizes[yearDimIdx];
    const regionCode = regionIndexToCode[regionIdx];
    const partyCode  = partyIndexToCode[partyIdx];
    const yearCode   = yearCodes[yearIdx];

    if (!regionCode || !partyCode || !yearCode) { continue; }
    // Area filter: 2-digit county (prefix) or exact 4-digit municipality
    if (areaCode && !regionCode.startsWith(areaCode)) { continue; }

    yearPartyCount[yearCode][partyCode] = (yearPartyCount[yearCode][partyCode] ?? 0) + num;
  }

  // Convert counts to shares per year, then build TimeSeriesNode per party.
  const partyPoints: Record<string, Array<{ date: string; value: number }>> = {};

  for (const [yearStr, partyCounts] of Object.entries(yearPartyCount)) {
    const yearNum = parseInt(yearStr, 10);
    if (!ELECTION_YEARS.includes(yearNum as (typeof ELECTION_YEARS)[number])) { continue; }

    const total = Object.values(partyCounts).reduce((s, v) => s + v, 0);
    if (total === 0) { continue; }

    for (const [party, count] of Object.entries(partyCounts)) {
      if (!partyPoints[party]) { partyPoints[party] = []; }
      partyPoints[party].push({
        date:  `${yearNum}-09-15`, // approximate (Swedish elections are held in September)
        value: Math.round((count / total) * 1000) / 10,
      });
    }
  }

  return PARTY_CODES
    .filter(p => (partyPoints[p]?.length ?? 0) > 0)
    .map(p => ({
      id:     p,
      label:  PARTY_LABELS[p] ?? p,
      points: partyPoints[p].sort((a, b) => a.date.localeCompare(b.date)),
    }));
}

// ── Dataset descriptor factory ────────────────────────────────────────────────

function makeElectionDescriptor(opts: {
  id:           string;
  label:        string;
  shortLabel:   string;
  tableId:      string;
  contentCode:  string;
  electionType: ElectionDatasetResult['electionType'];
  geodataId:    string;  // backend election slug (riksdag / regionval / kommunval)
}): DatasetDescriptor {
  const { id, label, shortLabel, tableId, contentCode, electionType, geodataId } = opts;

  async function fetchElection(level: AdminLevel, year: number): Promise<ElectionDatasetResult> {
    switch (level) {
      case 'Country':      return fetchCountryLevel(tableId, contentCode, year, label, electionType);
      case 'Region':       return fetchRegionLevel(tableId, contentCode, year, label, electionType);
      case 'Municipality': return fetchMunicipalityLevel(tableId, contentCode, year, label, electionType);
      case 'DeSO':         return fetchDesoRegsoLevel(geodataId, 'DeSO',  year);
      case 'RegSO':        return fetchDesoRegsoLevel(geodataId, 'RegSO', year);
      default: throw new Error(`Election dataset "${id}": unsupported level "${level}"`);
    }
  }

  return {
    id,
    label,
    shortLabel,
    group:      'val',
    groupLabel: 'Val',
    source:     'SCB',
    availableYears: [...ELECTION_YEARS],
    supportedLevels: ['Country', 'Region', 'Municipality', 'DeSO', 'RegSO'],
    supportedViews:  ['map', 'chart', 'table'],
    supportedViewsByLevel: {
      Country:      ['chart'],
      Region:       ['map', 'chart', 'table'],
      Municipality: ['map', 'chart', 'table'],
      DeSO:         ['map', 'table'],
      RegSO:        ['map', 'table'],
    },
    chartTypes: {
      Country:      ['multiline'],
      Region:       ['party-ranking', 'election-bar', 'multiline'],
      Municipality: ['party-ranking', 'election-bar', 'multiline'],
      DeSO:         ['party-ranking', 'election-bar'],
      RegSO:        ['party-ranking', 'election-bar'],
    },
    fetch:           fetchElection,
    fetchTimeSeries: (_level, featureCode) =>
      fetchElectionTimeSeries(tableId, contentCode, featureCode),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const riksdagsval = makeElectionDescriptor({
  id:           'riksdagsval',
  label:        'Riksdagsval',
  shortLabel:   'Riksdag',
  tableId:      RIKSDAG_TABLE,
  contentCode:  COUNT_CODE_RIKSDAG,
  electionType: 'riksdag',
  geodataId:    'riksdag',
});

export const regionval = makeElectionDescriptor({
  id:           'regionval',
  label:        'Regionval',
  shortLabel:   'Region',
  tableId:      REGION_TABLE,
  contentCode:  COUNT_CODE_REGION,
  electionType: 'region',
  geodataId:    'regionval',
});

export const kommunval = makeElectionDescriptor({
  id:           'kommunval',
  label:        'Kommunval',
  shortLabel:   'Kommun',
  tableId:      KOMMUN_TABLE,
  contentCode:  COUNT_CODE_KOMMUN,
  electionType: 'municipality',
  geodataId:    'kommunval',
});

export { PARTY_COLORS, PARTY_LABELS, PARTY_CODES };
