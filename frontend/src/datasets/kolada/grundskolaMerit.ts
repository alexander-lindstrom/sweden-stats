/**
 * Grundskola meritvärde åk 9 — year-9 school merit points
 * Kolada KPI: N15507 "Elever i åk 9, meritvärde, hemkommun, genomsnitt (17 ämnen)"
 *
 * Scale: 0–340 (17 subjects × max 20 points each).
 * "Hemkommun" = students registered in the municipality regardless of school location.
 * Also available broken down by gender (K/M) for later use.
 *
 * Cross-reference with: gymnasiebetyg, utbildningsniva, hogskolestudenter
 */

import { AdminLevel, DatasetDescriptor, ScalarDatasetResult } from '../types';
import { fetchKoladaMunicipality, getKoladaMunicipalityLabels } from './api';

const KPI_ID = 'N15507';

async function fetchGrundskolaMerit(_level: AdminLevel, year: number): Promise<ScalarDatasetResult> {
  const [values, labels] = await Promise.all([
    fetchKoladaMunicipality(KPI_ID, year),
    getKoladaMunicipalityLabels(),
  ]);
  return { kind: 'scalar', values, labels, label: 'Meritvärde åk 9', unit: 'poäng' };
}

export const grundskolaMerit: DatasetDescriptor = {
  id:              'grundskola-merit',
  label:           'Meritvärde åk 9',
  source:          'Kolada',
  availableYears:  Array.from({ length: 9 }, (_, i) => 2015 + i),
  supportedLevels: ['Municipality'],
  supportedViews:  ['map', 'chart', 'table'],
  chartTypes: {
    Municipality: ['bar', 'diverging', 'histogram'],
  },
  fetch: fetchGrundskolaMerit,
};
