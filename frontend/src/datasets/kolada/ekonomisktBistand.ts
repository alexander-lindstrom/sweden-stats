/**
 * Ekonomiskt bistånd (försörjningsstöd) — share of population receiving social assistance (%)
 * Kolada KPI: N31807 "Invånare som någon gång under året erhållit ekonomiskt bistånd, andel (%) av bef."
 *
 * Cross-reference with: medianinkomst, utlandsk_bakgrund
 * High median income in a municipality can coexist with significant welfare dependency.
 */

import type { DatasetDescriptor } from '../types';
import { fetchKoladaScalar } from './api';

export const ekonomisktBistand: DatasetDescriptor = {
  id:              'ekonomiskt-bistand',
  kpiId:           'N31807',
  label:           'Ekonomiskt bistånd',
  category:        'kolada',
  source:          'Kolada',
  availableYears:  Array.from({ length: 24 }, (_, i) => 2000 + i),
  supportedLevels: ['Region', 'Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: (level, year) => fetchKoladaScalar('N31807', level, year, 'Ekonomiskt bistånd', '% av bef.'),
};
