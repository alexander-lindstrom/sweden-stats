import { AdminLevel, DatasetDescriptor } from './types';
import { population } from './scb/population';

export const DATASETS: DatasetDescriptor[] = [population];

export function getDatasetsForLevel(level: AdminLevel): DatasetDescriptor[] {
  return DATASETS.filter((d) => d.supportedLevels.includes(level));
}
