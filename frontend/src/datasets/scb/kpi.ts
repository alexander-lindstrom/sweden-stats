import { AdminLevel, DatasetDescriptor, DatasetResult, TimeSeriesNode } from '../types';
import { fetchScbData } from '@/api/backend/ScbApi';

const QUERY_BODY = {
  query: [
    {
      code: 'VaruTjanstegrupp',
      selection: {
        filter: 'vs:VaruTjänstegrCoicopA',
        values: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '11', '12'],
      },
    },
    {
      code: 'ContentsCode',
      selection: {
        filter: 'item',
        values: ['000003TJ'],
      },
    },
  ],
  response: { format: 'json-stat2' },
};

interface KpiApiResponse {
  dimension: {
    VaruTjanstegrupp: {
      category: { label: Record<string, string> };
    };
    Tid: {
      category: {
        index: Record<string, number>;
        label: Record<string, string>;
      };
    };
  };
  size: number[];
  value: number[];
}

/** Parses SCB YYYYMXX date format (e.g. "2023M01") to ISO YYYY-MM-DD. */
function parseScbMonth(dateStr: string): string {
  const year  = dateStr.substring(0, 4);
  const month = dateStr.substring(5, 7);
  return `${year}-${month}-01`;
}

/**
 * SCB omits category 10 (education/utbildning) from the data array but still
 * assigns codes 01–12 (minus 10). This means the index into the value array
 * must skip the gap at code 10.
 */
const MISSING_CODES = new Set(['10']);

function adjustedCategoryIndex(code: string): number {
  const n = parseInt(code, 10);
  let offset = 0;
  for (const m of MISSING_CODES) {
    if (parseInt(m, 10) < n) { offset++; }
  }
  return n - offset;
}

async function fetchKpiTimeSeries(): Promise<TimeSeriesNode[]> {
  const raw: KpiApiResponse = await fetchScbData('START/PR/PR0101/PR0101A/KPICOI80MN', QUERY_BODY);

  const categoryLabels = raw.dimension.VaruTjanstegrupp.category.label;
  const timeIndex      = raw.dimension.Tid.category.index;
  const timeKeys       = Object.keys(timeIndex);
  const nTimePoints    = raw.size[2];

  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return Object.entries(categoryLabels).map(([code, name]) => {
    const catIdx = adjustedCategoryIndex(code);

    const points = timeKeys
      .map(timeKey => {
        const tIdx   = timeIndex[timeKey];
        const vIdx   = tIdx + (catIdx - 1) * nTimePoints;
        const value  = raw.value[vIdx];
        return Number.isFinite(value) ? { date: parseScbMonth(timeKey), value } : null;
      })
      .filter((p): p is { date: string; value: number } => p !== null);

    return { id: code, label: capitalise(name), points };
  });
}

const EMPTY_RESULT: DatasetResult = { values: {}, labels: {}, label: 'KPI', unit: '' };

export const kpi: DatasetDescriptor = {
  id:              'kpi',
  label:           'KPI (inflation)',
  source:          'SCB',
  availableYears:  [],         // no year slider — always fetches full time series
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['multiline'] },
  fetch:           async (_level: AdminLevel, _year: number) => EMPTY_RESULT,
  fetchTimeSeries: async () => fetchKpiTimeSeries(),
};
