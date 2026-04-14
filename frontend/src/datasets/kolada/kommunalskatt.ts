/**
 * Kommunalskatt — municipal tax rate (%)
 * Kolada KPI: N00901 "Skattesats till kommun (%)"
 *
 * Cross-reference with: medianinkomst
 * "This municipality has median income 380 tkr and charges 19.4% in local tax."
 */

import type { DatasetDescriptor } from '../types';
import { fetchKoladaScalar } from './api';

export const kommunalskatt: DatasetDescriptor = {
  id:              'kommunalskatt',
  kpiId:           'N00901',
  label:           'Kommunalskatt',
  category:        'kolada',
  source:          'Kolada',
  availableYears:  Array.from({ length: 25 }, (_, i) => 2000 + i),
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['diverging', 'histogram'],
  },
  fetch: (level, year) => fetchKoladaScalar('N00901', level, year, 'Kommunalskatt', '%'),
};
