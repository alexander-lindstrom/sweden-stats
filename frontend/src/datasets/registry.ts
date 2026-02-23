import { AdminLevel, DatasetDescriptor } from './types';
import { populationByRegion } from './scb/populationByRegion';

export const DATASETS: DatasetDescriptor[] = [populationByRegion];

export function getDatasetsForLevel(level: AdminLevel): DatasetDescriptor[] {
  return DATASETS.filter((d) => d.supportedLevels.includes(level));
}
