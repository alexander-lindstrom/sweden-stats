import { fetchScbData } from '@/api/backend/ScbApi';
import {
  AdminLevel, DatasetDescriptor, ElectionDatasetResult, TimeSeriesNode,
} from '../types';
import { ELECTION_YEARS, PARTY_CODES, PARTY_COLORS, PARTY_LABELS, normalizePartyCode } from '../parties';
import { COUNTY_NAMES } from '../adminLevels';

// ── SCB v1 PxWeb paths (proxied through FastAPI backend) ─────────────────────
// ME0104T3 = riksdag results by municipality/valkrets, 1973–2022
// ME0104T2 = regionfullmäktige results, 1973–2022
// ME0104T1 = kommunfullmäktige results, 1973–2022
const RIKSDAG_PATH  = 'ME/ME0104/ME0104C/ME0104T3';
const REGION_PATH   = 'ME/ME0104/ME0104B/ME0104T2';
const KOMMUN_PATH   = 'ME/ME0104/ME0104A/ME0104T1';

// SCB variable names in the ME0104 election tables.
// "Partimm" = party; content codes differ per table (all mean "Antal röster").
const PARTY_VAR  = 'Partimm';
const YEAR_VAR   = 'Tid';
const REGION_VAR = 'Region';

// Each ME0104 sub-table uses its own ContentsCode for "Antal röster".
const CONTENT_CODE_RIKSDAG = 'ME0104B6'; // ME0104T3
const CONTENT_CODE_REGION  = 'ME0104B4'; // ME0104T2
const CONTENT_CODE_KOMMUN  = 'ME0104B1'; // ME0104T1

// Party codes as used by SCB (FP is handled via normalizePartyCode → L).
const SCB_PARTY_CODES = ['S', 'M', 'SD', 'C', 'V', 'KD', 'MP', 'FP', 'ÖVRIGA'];

// County (2-digit) codes for the 21 Swedish läns.
const COUNTY_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Snap an arbitrary year to the nearest available election year. */
function nearestElectionYear(year: number): number {
  return ELECTION_YEARS.reduce((prev, curr) =>
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev,
  );
}

interface JsonStat2 {
  id:        string[];
  size:      number[];
  value:     (number | null)[];
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

/**
 * Parse a JSON-stat2 response that has Region × Party dimensions.
 * Returns raw vote counts per region per party.
 */
function parseElectionResponse(
  data: JsonStat2,
): { counts: Record<string, Record<string, number>>; labels: Record<string, string> } {
  const dimIds = data.id;
  const sizes  = data.size;

  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf(REGION_VAR);
  const partyDimIdx  = dimIds.indexOf(PARTY_VAR);
  if (regionDimIdx === -1 || partyDimIdx === -1) {
    throw new Error(`SCB election response missing expected dimensions. Got: ${dimIds.join(', ')}`);
  }

  const regionDim = data.dimension[REGION_VAR];
  const partyDim  = data.dimension[PARTY_VAR];

  const indexToRegion: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToRegion[idx as number] = code;
  }

  const indexToParty: Record<number, string> = {};
  for (const [code, idx] of Object.entries(partyDim.category.index)) {
    indexToParty[idx as number] = normalizePartyCode(code);
  }

  const counts: Record<string, Record<string, number>> = {};
  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) { continue; }
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) { continue; }

    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const partyIdx  = Math.floor(i / strides[partyDimIdx])  % sizes[partyDimIdx];
    const regionCode = indexToRegion[regionIdx];
    const partyCode  = indexToParty[partyIdx];

    if (!regionCode || !partyCode) { continue; }

    if (!counts[regionCode]) { counts[regionCode] = {}; }
    counts[regionCode][partyCode] = (counts[regionCode][partyCode] ?? 0) + num;
  }

  const labels = { ...regionDim.category.label } as Record<string, string>;
  return { counts, labels };
}

/**
 * Convert raw vote counts into an ElectionDatasetResult.
 * For each geo code, compute vote shares and determine the winner.
 */
function buildElectionResult(
  counts: Record<string, Record<string, number>>,
  labels: Record<string, string>,
  label: string,
  electionType: ElectionDatasetResult['electionType'],
): ElectionDatasetResult {
  const partyVotes:  Record<string, Record<string, number>> = {};
  const winnerByGeo: Record<string, string> = {};

  for (const [geoCode, partyCounts] of Object.entries(counts)) {
    const total = Object.values(partyCounts).reduce((s, v) => s + v, 0);
    if (total === 0) { continue; }

    const shares: Record<string, number> = {};
    let winnerCode = '';
    let winnerShare = -1;

    for (const [party, count] of Object.entries(partyCounts)) {
      const share = (count / total) * 100;
      shares[party] = Math.round(share * 10) / 10;
      if (share > winnerShare) {
        winnerShare = share;
        winnerCode = party;
      }
    }

    partyVotes[geoCode]  = shares;
    winnerByGeo[geoCode] = winnerCode;
  }

  return {
    kind: 'election',
    partyVotes,
    winnerByGeo,
    labels,
    label,
    unit: '%',
    electionType,
  };
}

// ── Fetch: municipality-level data (used for both Municipality and Region) ────

async function fetchMunicipalityData(
  path: string,
  year: number,
  contentCode: string,
): Promise<{ counts: Record<string, Record<string, number>>; labels: Record<string, string> }> {
  const electionYear = nearestElectionYear(year);

  const raw: JsonStat2 = await fetchScbData(path, {
    query: [
      // "all" filter returns every region value; we then filter to 4-digit codes.
      { code: REGION_VAR, selection: { filter: 'all', values: ['*'] } },
      { code: PARTY_VAR,  selection: { filter: 'item', values: SCB_PARTY_CODES } },
      { code: 'ContentsCode', selection: { filter: 'item', values: [contentCode] } },
      { code: YEAR_VAR,   selection: { filter: 'item', values: [String(electionYear)] } },
    ],
    response: { format: 'json-stat2' },
  });

  const { counts: allCounts, labels: allLabels } = parseElectionResponse(raw);

  // Keep only 4-digit municipality codes.
  const counts: Record<string, Record<string, number>> = {};
  const labels: Record<string, string> = {};
  for (const [code, partyCounts] of Object.entries(allCounts)) {
    if (code.length === 4) {
      counts[code] = partyCounts;
      labels[code] = allLabels[code] ?? code;
    }
  }

  return { counts, labels };
}

// ── Fetch: country-level (aggregate all municipalities) ───────────────────────

async function fetchCountryLevel(
  path: string,
  year: number,
  label: string,
  electionType: ElectionDatasetResult['electionType'],
  contentCode: string,
): Promise<ElectionDatasetResult> {
  const { counts: muniCounts, labels: muniLabels } = await fetchMunicipalityData(path, year, contentCode);

  // Aggregate all municipality counts into one national total.
  const national: Record<string, number> = {};
  for (const partyCounts of Object.values(muniCounts)) {
    for (const [party, count] of Object.entries(partyCounts)) {
      national[party] = (national[party] ?? 0) + count;
    }
  }

  // The national entry needs a label — use "Sverige".
  const result = buildElectionResult({ SE: national }, { SE: 'Sverige', ...muniLabels }, label, electionType);
  return result;
}

// ── Fetch: region (county/Lan) level ─────────────────────────────────────────

async function fetchRegionLevel(
  path: string,
  year: number,
  label: string,
  electionType: ElectionDatasetResult['electionType'],
  contentCode: string,
): Promise<ElectionDatasetResult> {
  const { counts: muniCounts } = await fetchMunicipalityData(path, year, contentCode);

  // Aggregate municipality counts up to county (first 2 digits of municipality code).
  const countyCounts: Record<string, Record<string, number>> = {};
  for (const countyCode of COUNTY_CODES) {
    countyCounts[countyCode] = {};
  }

  for (const [muniCode, partyCounts] of Object.entries(muniCounts)) {
    const countyCode = muniCode.slice(0, 2);
    if (!countyCounts[countyCode]) { continue; }
    for (const [party, count] of Object.entries(partyCounts)) {
      countyCounts[countyCode][party] = (countyCounts[countyCode][party] ?? 0) + count;
    }
  }

  // Build county labels using the authoritative COUNTY_NAMES mapping.
  const countyLabels: Record<string, string> = {};
  for (const code of COUNTY_CODES) {
    countyLabels[code] = COUNTY_NAMES[code] ?? code;
  }

  return buildElectionResult(countyCounts, countyLabels, label, electionType);
}

// ── Fetch: municipality-level result ─────────────────────────────────────────

async function fetchMunicipalityLevel(
  path: string,
  year: number,
  label: string,
  electionType: ElectionDatasetResult['electionType'],
  contentCode: string,
): Promise<ElectionDatasetResult> {
  const { counts, labels } = await fetchMunicipalityData(path, year, contentCode);
  return buildElectionResult(counts, labels, label, electionType);
}

// ── Time series fetch (national or per-area, one line per party) ─────────────

/**
 * Fetch party vote-share time series across all election years.
 * If areaCode is provided (2-digit county or 4-digit municipality), the series
 * is limited to that area; otherwise a national aggregate is returned.
 */
async function fetchElectionTimeSeries(
  path: string,
  contentCode: string,
  areaCode?: string,
): Promise<TimeSeriesNode[]> {
  // Fetch all election years at once for the national total.
  const raw: JsonStat2 = await fetchScbData(path, {
    query: [
      { code: REGION_VAR, selection: { filter: 'all', values: ['*'] } },
      { code: PARTY_VAR,  selection: { filter: 'item', values: SCB_PARTY_CODES } },
      { code: 'ContentsCode', selection: { filter: 'item', values: [contentCode] } },
      { code: YEAR_VAR,   selection: { filter: 'all', values: ['*'] } },
    ],
    response: { format: 'json-stat2' },
  });

  // Parse all data, then aggregate to national per year.
  const dimIds = raw.id;
  const sizes  = raw.size;
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf(REGION_VAR);
  const partyDimIdx  = dimIds.indexOf(PARTY_VAR);
  const yearDimIdx   = dimIds.indexOf(YEAR_VAR);
  if (regionDimIdx === -1 || partyDimIdx === -1 || yearDimIdx === -1) {
    throw new Error(`Time series: missing dimensions. Got: ${dimIds.join(', ')}`);
  }

  const regionDim = raw.dimension[REGION_VAR];
  const partyDim  = raw.dimension[PARTY_VAR];
  const yearDim   = raw.dimension[YEAR_VAR];

  const regionIndexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    regionIndexToCode[idx as number] = code;
  }
  const partyIndexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(partyDim.category.index)) {
    partyIndexToCode[idx as number] = normalizePartyCode(code);
  }
  const yearCodes = Object.keys(yearDim.category.index).sort(
    (a, b) => (yearDim.category.index[a] as number) - (yearDim.category.index[b] as number),
  );

  // Accumulate counts: yearCode → partyCode → total count (national)
  const yearPartyCount: Record<string, Record<string, number>> = {};
  for (const yr of yearCodes) {
    yearPartyCount[yr] = {};
  }

  for (let i = 0; i < raw.value.length; i++) {
    const val = raw.value[i];
    if (val === null || val === undefined) { continue; }
    const num = typeof val === 'number' ? val : parseFloat(val as string);
    if (isNaN(num) || num === 0) { continue; }

    const regionIdx = Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const partyIdx  = Math.floor(i / strides[partyDimIdx])  % sizes[partyDimIdx];
    const yearIdx   = Math.floor(i / strides[yearDimIdx])   % sizes[yearDimIdx];

    const regionCode = regionIndexToCode[regionIdx];
    const partyCode  = partyIndexToCode[partyIdx];
    const yearCode   = yearCodes[yearIdx];

    // Only municipality codes (4-digit) to avoid double-counting aggregates.
    if (!regionCode || regionCode.length !== 4 || !partyCode || !yearCode) { continue; }

    // Area filter: county (2-digit prefix match) or specific municipality (exact).
    if (areaCode && !regionCode.startsWith(areaCode)) { continue; }

    yearPartyCount[yearCode][partyCode] = (yearPartyCount[yearCode][partyCode] ?? 0) + num;
  }

  // Convert counts to shares per year, then build TimeSeriesNode per party.
  const partyPoints: Record<string, Array<{ date: string; value: number }>> = {};

  for (const [yearStr, partyCounts] of Object.entries(yearPartyCount)) {
    const yearNum = parseInt(yearStr, 10);
    if (!ELECTION_YEARS.includes(yearNum as typeof ELECTION_YEARS[number])) { continue; }

    const total = Object.values(partyCounts).reduce((s, v) => s + v, 0);
    if (total === 0) { continue; }

    for (const [party, count] of Object.entries(partyCounts)) {
      if (!partyPoints[party]) { partyPoints[party] = []; }
      partyPoints[party].push({
        date:  `${yearNum}-09-15`, // approximate election date (Sweden elects in September)
        value: Math.round((count / total) * 1000) / 10, // one decimal %
      });
    }
  }

  // Return in canonical party order; include only parties with any data.
  return PARTY_CODES
    .filter(p => (partyPoints[p]?.length ?? 0) > 0)
    .map(p => ({
      id:     p,
      label:  PARTY_LABELS[p] ?? p,
      points: partyPoints[p].sort((a, b) => a.date.localeCompare(b.date)),
    }));
}

// ── Dataset descriptor factories ─────────────────────────────────────────────

function makeElectionDescriptor(opts: {
  id:           string;
  label:        string;
  shortLabel:   string;
  path:         string;
  contentCode:  string;
  electionType: ElectionDatasetResult['electionType'];
}): DatasetDescriptor {
  const { id, label, shortLabel, path, contentCode, electionType } = opts;

  async function fetchElection(level: AdminLevel, year: number): Promise<ElectionDatasetResult> {
    switch (level) {
      case 'Country':      return fetchCountryLevel(path, year, label, electionType, contentCode);
      case 'Region':       return fetchRegionLevel(path, year, label, electionType, contentCode);
      case 'Municipality': return fetchMunicipalityLevel(path, year, label, electionType, contentCode);
      default: throw new Error(`Election dataset "${id}": unsupported level "${level}"`);
    }
  }

  return {
    id,
    label,
    shortLabel,
    group: 'val',
    groupLabel: 'Val',
    source: 'SCB',
    availableYears: [...ELECTION_YEARS],
    supportedLevels: ['Country', 'Region', 'Municipality'],
    supportedViews: ['map', 'chart'],
    supportedViewsByLevel: {
      Country:      ['chart'],
      Region:       ['map', 'chart'],
      Municipality: ['map', 'chart'],
    },
    chartTypes: {
      Country:      ['multiline'],
      Region:       ['election-bar', 'multiline', 'party-ranking'],
      Municipality: ['election-bar', 'multiline', 'party-ranking'],
    },
    fetch: fetchElection,
    fetchTimeSeries: (_level, featureCode) => fetchElectionTimeSeries(path, contentCode, featureCode),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const riksdagsval = makeElectionDescriptor({
  id:           'riksdagsval',
  label:        'Riksdagsval',
  shortLabel:   'Riksdag',
  path:         RIKSDAG_PATH,
  contentCode:  CONTENT_CODE_RIKSDAG,
  electionType: 'riksdag',
});

export const regionval = makeElectionDescriptor({
  id:           'regionval',
  label:        'Regionval',
  shortLabel:   'Region',
  path:         REGION_PATH,
  contentCode:  CONTENT_CODE_REGION,
  electionType: 'region',
});

export const kommunval = makeElectionDescriptor({
  id:           'kommunval',
  label:        'Kommunval',
  shortLabel:   'Kommun',
  path:         KOMMUN_PATH,
  contentCode:  CONTENT_CODE_KOMMUN,
  electionType: 'municipality',
});

// Re-export party metadata for convenience.
export { PARTY_COLORS, PARTY_LABELS, PARTY_CODES };
