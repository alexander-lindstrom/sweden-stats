import { AdminLevel, DatasetDescriptor } from './types';
import { population } from './scb/population';
import { medelalder } from './scb/medelalder';
import { medianinkomst } from './scb/medianinkomst';

export const DATASETS: DatasetDescriptor[] = [population, medelalder, medianinkomst];

export function getDatasetsForLevel(level: AdminLevel): DatasetDescriptor[] {
  return DATASETS.filter((d) => d.supportedLevels.includes(level));
}
