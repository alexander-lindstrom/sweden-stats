/**
 * Valdeltagande kommunalvalet — municipal election turnout (%)
 * Kolada KPI: N05401 "Valdeltagande i senaste kommunalvalet, andel (%)"
 *
 * Data only exists for Swedish municipal election years (every 4 years).
 *
 * Cross-reference with: kommunval (party-vote distribution)
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { fetchKoladaMunicipality, getKoladaMunicipalityLabels } from './api';

const KPI_ID = 'N05401';

// Swedish municipal elections are held every 4 years.
const ELECTION_YEARS = [2006, 2010, 2014, 2018, 2022];

async function fetchValdeltagande(_level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Valdeltagande kommunalvalet', unit: '%' };
}

export const valdeltagande: DatasetDescriptor = {
  id:              'valdeltagande-kommunal',
  label:           'Valdeltagande (kommunalval)',
  source:          'Kolada',
  availableYears:  ELECTION_YEARS,
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchValdeltagande,
};
