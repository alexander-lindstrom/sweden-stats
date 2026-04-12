/**
 * Kostnad äldreomsorg per invånare 80+ — elder care cost per resident aged 80+ (kr)
 * Kolada KPI: N20048 "Kostnad äldreomsorg, kr/inv 80+"
 *
 * Cross-reference with: medelalder
 * Rural municipalities with older-skewing populations face a structural fiscal squeeze:
 * high elder care costs per capita against a shrinking tax base.
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { fetchKoladaMunicipality, getKoladaMunicipalityLabels } from './api';

const KPI_ID = 'N20048';

async function fetchAldreomsorg(_level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Äldreomsorg kostnad', unit: 'kr/inv 80+' };
}

export const aldreomsorg: DatasetDescriptor = {
  id:              'aldreomsorg-kostnad',
  label:           'Äldreomsorg (kostnad/inv 80+)',
  category:        'valfard' as const,
  source:          'Kolada',
  availableYears:  Array.from({ length: 24 }, (_, i) => 2000 + i),
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchAldreomsorg,
};
