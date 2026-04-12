/**
 * Kommunalskatt — municipal tax rate (%)
 * Kolada KPI: N00901 "Skattesats till kommun (%)"
 *
 * Cross-reference with: medianinkomst
 * "This municipality has median income 380 tkr and charges 19.4% in local tax."
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { fetchKoladaMunicipality, getKoladaMunicipalityLabels } from './api';

const KPI_ID = 'N00901';

async function fetchKommunalskatt(_level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Kommunalskatt', unit: '%' };
}

export const kommunalskatt: DatasetDescriptor = {
  id:              'kommunalskatt',
  label:           'Kommunalskatt',
  source:          'Kolada',
  availableYears:  Array.from({ length: 25 }, (_, i) => 2000 + i),
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchKommunalskatt,
};
