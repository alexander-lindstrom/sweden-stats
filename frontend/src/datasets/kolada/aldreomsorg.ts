/**
 * Kostnad äldreomsorg per invånare 80+ — elder care cost per resident aged 80+ (kr)
 * Kolada KPI: N20048 "Kostnad äldreomsorg, kr/inv 80+"
 *
 * Cross-reference with: medelalder
 * Rural municipalities with older-skewing populations face a structural fiscal squeeze:
 * high elder care costs per capita against a shrinking tax base.
 */

import type { DatasetDescriptor } from '../types';
import { fetchKoladaScalar } from './api';

export const aldreomsorg: DatasetDescriptor = {
  id:              'aldreomsorg-kostnad',
  kpiId:           'N20048',
  label:           'Äldreomsorg (kostnad/inv 80+)',
  category:        'kolada',
  source:          'Kolada',
  availableYears:  Array.from({ length: 24 }, (_, i) => 2000 + i),
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: (level, year) => fetchKoladaScalar('N20048', level, year, 'Äldreomsorg kostnad', 'kr/inv 80+'),
};
