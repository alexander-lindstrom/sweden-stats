import { AdminLevel, DatasetDescriptor, ScalarDatasetResult, TimeSeriesNode } from '../types';

// ── TAB5311 ───────────────────────────────────────────────────────────────────
// "Betygspoäng för elever på gymnasieskolan med slutbetyg efter svensk och
//  utländsk bakgrund samt föräldrarnas utbildningsnivå. Läsår 2013/14–2023/24"
// National only. We select totalt for background and parental education and
// split only on gender to produce two time series lines.

const DATA_URL = 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5311/data?outputFormat=json-stat2';

const SCHOOL_YEARS = [
  '2013/14', '2014/15', '2015/16', '2016/17', '2017/18',
  '2018/19', '2019/20', '2020/21', '2021/22', '2022/23', '2023/24',
];

/** "2013/14" → "2014-01-01" (start of the graduation calendar year). */
function schoolYearToDate(sy: string): string {
  const endYear = parseInt(sy.split('/')[0], 10) + 1;
  return `${endYear}-01-01`;
}

async function fetchGymnasiebetygTimeSeries(): Promise<TimeSeriesNode[]> {
  const res = await fetch(DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selection: [
        { variableCode: 'ForUtb',        valueCodes: ['40']       }, // totalt
        { variableCode: 'SvUtlBakgrund', valueCodes: ['SA']       }, // totalt
        { variableCode: 'Kon',           valueCodes: ['1', '2']   }, // pojkar, flickor
        { variableCode: 'ContentsCode',  valueCodes: ['000003B9'] },
        { variableCode: 'Tid',           valueCodes: SCHOOL_YEARS },
      ],
    }),
  });
  if (!res.ok) { throw new Error(`TAB5311 fetch failed: ${res.status}`); }

  const data = await res.json() as {
    id: string[];
    size: number[];
    value: (number | null)[];
    dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
  };

  const strides = new Array(data.id.length).fill(1);
  for (let i = data.id.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * data.size[i + 1];
  }

  const konDimIdx = data.id.indexOf('Kon');
  const tidDimIdx = data.id.indexOf('Tid');
  const konDim    = data.dimension['Kon'].category;
  const tidDim    = data.dimension['Tid'].category;

  const timeKeys = Object.keys(tidDim.index).sort((a, b) => tidDim.index[a] - tidDim.index[b]);

  return Object.entries(konDim.label).map(([code, _rawLabel]) => {
    const konIdx = konDim.index[code];
    const label  = code === '1' ? 'Pojkar' : 'Flickor';

    const points = timeKeys
      .map(sy => {
        const tIdx  = tidDim.index[sy];
        const vIdx  = konIdx * strides[konDimIdx] + tIdx * strides[tidDimIdx];
        const value = data.value[vIdx];
        return value != null && Number.isFinite(value)
          ? { date: schoolYearToDate(sy), value }
          : null;
      })
      .filter((p): p is { date: string; value: number } => p !== null);

    return { id: code, label, points };
  });
}

const EMPTY_RESULT: ScalarDatasetResult = {
  kind: 'scalar', values: {}, labels: {}, label: 'Gymnasiebetyg', unit: '',
};

export const gymnasiebetyg: DatasetDescriptor = {
  id:              'gymnasiebetyg',
  label:           'Gymnasiebetyg',
  source:          'SCB',
  timeSeriesUnit:  'poäng',
  availableYears:  [],
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['multiline'] },
  fetch:           async (_level: AdminLevel, _year: number) => EMPTY_RESULT,
  fetchTimeSeries: async () => fetchGymnasiebetygTimeSeries(),
};
