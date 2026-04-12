/**
 * Ekonomiskt bistånd (försörjningsstöd) — share of population receiving social assistance (%)
 * Kolada KPI: N31807 "Invånare som någon gång under året erhållit ekonomiskt bistånd, andel (%) av bef."
 *
 * Cross-reference with: medianinkomst, utlandsk_bakgrund
 * High median income in a municipality can coexist with significant welfare dependency.
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import {
  fetchKoladaMunicipality, getKoladaMunicipalityLabels,
  fetchKoladaRegion, getKoladaRegionLabels,
} from './api';

const KPI_ID = 'N31807';

async function fetchEkonomisktBistand(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  if (level === 'Region') {
    const values = fetchKoladaRegion(KPI_ID, year);
    return { kind: 'scalar', values: await values, labels: getKoladaRegionLabels(), label: 'Ekonomiskt bistånd', unit: '% av bef.' };
  }
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Ekonomiskt bistånd', unit: '% av bef.' };
}

export const ekonomisktBistand: DatasetDescriptor = {
  id:              'ekonomiskt-bistand',
  label:           'Ekonomiskt bistånd',
  source:          'Kolada',
  availableYears:  Array.from({ length: 24 }, (_, i) => 2000 + i),
  supportedLevels: ['Region', 'Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchEkonomisktBistand,
};
