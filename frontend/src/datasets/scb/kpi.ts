import { AdminLevel, DatasetDescriptor, ScalarDatasetResult, TimeSeriesNode } from '../types';

const DATA_URL = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5512/data?outputFormat=json-stat2';

/** TAB5512 runs 1980M01–2025M12 and is frozen (base year moves to 2020 from 2026). */
function monthCodes(startYear: number, endYear: number): string[] {
  const codes: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      codes.push(`${y}M${String(m).padStart(2, '0')}`);
    }
  }
  return codes;
}

const QUERY_BODY = {
  selection: [
    { variableCode: 'VaruTjanstegrupp', valueCodes: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12'] },
    { variableCode: 'ContentsCode', valueCodes: ['000003TJ'] },
    { variableCode: 'Tid', valueCodes: monthCodes(1980, 2025) },
  ],
};

interface KpiApiResponse {
  id: string[];
  size: number[];
  value: (number | null)[];
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

/** Parses SCB YYYYMXX date format (e.g. "2023M01") to ISO YYYY-MM-DD. */
function parseScbMonth(dateStr: string): string {
  const year  = dateStr.substring(0, 4);
  const month = dateStr.substring(5, 7);
  return `${year}-${month}-01`;
}

async function fetchKpiTimeSeries(): Promise<TimeSeriesNode[]> {
  const response = await fetch(DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(QUERY_BODY),
  });
  if (!response.ok) { throw new Error(`SCB KPI fetch failed: ${response.statusText}`); }
  const raw: KpiApiResponse = await response.json();

  // Compute strides for indexing into the flat value array.
  const strides = new Array(raw.id.length).fill(1);
  for (let i = raw.id.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * raw.size[i + 1];
  }
  const catPos = raw.id.indexOf('VaruTjanstegrupp');
  const tidPos = raw.id.indexOf('Tid');

  const catDim  = raw.dimension['VaruTjanstegrupp'].category;
  const timeDim = raw.dimension['Tid'].category;
  const timeKeys = Object.keys(timeDim.index).sort((a, b) => timeDim.index[a] - timeDim.index[b]);

  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return Object.entries(catDim.label).map(([code, name]) => {
    const catIdx = catDim.index[code];

    const points = timeKeys
      .map(timeKey => {
        const tIdx  = timeDim.index[timeKey];
        const vIdx  = catIdx * strides[catPos] + tIdx * strides[tidPos];
        const value = raw.value[vIdx];
        return value != null && Number.isFinite(value) ? { date: parseScbMonth(timeKey), value } : null;
      })
      .filter((p): p is { date: string; value: number } => p !== null);

    return { id: code, label: capitalise(name), points };
  });
}

const EMPTY_RESULT: ScalarDatasetResult = { kind: 'scalar', values: {}, labels: {}, label: 'KPI', unit: '' };

export const kpi: DatasetDescriptor = {
  id:              'kpi',
  label:           'KPI',
  source:          'SCB',
  availableYears:  [],         // no year slider — always fetches full time series
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['multiline'] },
  fetch:           async (_level: AdminLevel, _year: number) => EMPTY_RESULT,
  fetchTimeSeries: async () => fetchKpiTimeSeries(),
};
