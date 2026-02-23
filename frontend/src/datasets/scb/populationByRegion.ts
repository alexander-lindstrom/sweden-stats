import { JsonStat2Response } from '@/util/scb';
import { AdminLevel, DatasetDescriptor, DatasetResult } from '../types';

const REGION_CODES = [
  '01', '03', '04', '05', '06', '07', '08', '09', '10',
  '12', '13', '14', '17', '18', '19', '20', '21', '22', '23', '24', '25',
];

const SCB_URL =
  'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5444/data?outputFormat=json-stat2';

/**
 * Aggregate JSON-stat2 values by the "Region" dimension, summing all other
 * dimensions (age, sex, …).  Returns a map of region code → total value.
 */
function aggregateByRegion(data: JsonStat2Response): Record<string, number> {
  const dimIds = data.id;      // e.g. ["Region","Alder","Kon","ContentsCode","Tid"]
  const sizes  = data.size;    // e.g. [21, 101, 2, 1, 1]

  // Row-major strides
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionDimIdx = dimIds.indexOf('Region');
  if (regionDimIdx === -1) {
    throw new Error('SCB response missing "Region" dimension');
  }

  const regionDim = data.dimension['Region'];
  // index property: { "01": 0, "03": 1, … }
  const indexToCode: Record<number, string> = {};
  for (const [code, idx] of Object.entries(regionDim.category.index)) {
    indexToCode[idx as number] = code;
  }

  const result: Record<string, number> = {};

  for (let i = 0; i < data.value.length; i++) {
    const raw = data.value[i];
    if (raw === null || raw === undefined) continue;
    const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
    if (isNaN(num)) continue;

    const regionIdx =
      Math.floor(i / strides[regionDimIdx]) % sizes[regionDimIdx];
    const code = indexToCode[regionIdx];
    if (code) {
      result[code] = (result[code] ?? 0) + num;
    }
  }

  return result;
}

async function fetchPopulationByRegion(_level: AdminLevel): Promise<DatasetResult> {
  const body = {
    selection: [
      { variableCode: 'Region',       valueCodes: REGION_CODES },
      { variableCode: 'Kon',          valueCodes: ['1', '2'] },
      { variableCode: 'ContentsCode', valueCodes: ['000003O5'] },
      { variableCode: 'Tid',          valueCodes: ['2024M12'] },
      // Alder omitted — API returns all age groups by default
    ],
  };

  const res = await fetch(SCB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`SCB API error: ${res.status} ${res.statusText}`);
  }

  const data: JsonStat2Response = await res.json();
  const values = aggregateByRegion(data);

  return { values, label: 'Folkmängd', unit: 'persons' };
}

export const populationByRegion: DatasetDescriptor = {
  id: 'population-by-region',
  label: 'Folkmängd',
  supportedLevels: ['Country'],
  supportedViews: ['map', 'chart', 'table'],
  fetch: fetchPopulationByRegion,
};
