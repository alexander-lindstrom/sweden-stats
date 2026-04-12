/**
 * Valdeltagande kommunalvalet — municipal election turnout (%)
 * Kolada KPI: N05401 "Valdeltagande i senaste kommunalvalet, andel (%)"
 *
 * Data only exists for Swedish municipal election years (every 4 years).
 *
 * Cross-reference with: kommunval (party-vote distribution)
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import {
  fetchKoladaMunicipality, getKoladaMunicipalityLabels,
  fetchKoladaRegion, getKoladaRegionLabels,
} from './api';

const KPI_ID = 'N05401';

// Swedish municipal elections are held every 4 years.
const ELECTION_YEARS = [2006, 2010, 2014, 2018, 2022];

async function fetchValdeltagande(level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  if (level === 'Region') {
    const values = await fetchKoladaRegion(KPI_ID, year);
    return { kind: 'scalar', values, labels: getKoladaRegionLabels(), label: 'Valdeltagande kommunalvalet', unit: '%' };
  }
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Valdeltagande kommunalvalet', unit: '%' };
}

export const valdeltagande: DatasetDescriptor = {
  id:              'valdeltagande-kommunal',
  label:           'Valdeltagande (kommunalval)',
  category:        'val' as const,
  source:          'Kolada',
  availableYears:  ELECTION_YEARS,
  supportedLevels: ['Region', 'Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Region:       ['bar', 'diverging', 'histogram'],
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchValdeltagande,
};
