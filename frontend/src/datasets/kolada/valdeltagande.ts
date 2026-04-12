/**
 * Valdeltagande kommunalvalet — municipal election turnout (%)
 * Kolada KPI: N05401 "Valdeltagande i senaste kommunalvalet, andel (%)"
 *
 * Data only exists for Swedish municipal election years (every 4 years).
 *
 * Cross-reference with: kommunval (party-vote distribution)
 */

import type { DatasetDescriptor } from '../types';
import { fetchKoladaScalar } from './api';

// Swedish municipal elections are held every 4 years.
const ELECTION_YEARS = [2006, 2010, 2014, 2018, 2022];

export const valdeltagande: DatasetDescriptor = {
  id:              'valdeltagande-kommunal',
  label:           'Valdeltagande (kommunalval)',
  category:        'val',
  source:          'Kolada',
  availableYears:  ELECTION_YEARS,
  supportedLevels: ['Region', 'Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: (level, year) => fetchKoladaScalar('N05401', level, year, 'Valdeltagande kommunalvalet', '%'),
};
