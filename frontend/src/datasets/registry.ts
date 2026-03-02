import { AdminLevel, DatasetDescriptor } from './types';
import { population } from './scb/population';
import { medelalder } from './scb/medelalder';
import { medianinkomst } from './scb/medianinkomst';
import { stateExpenses } from './esv/stateExpenses';
import { kpi } from './scb/kpi';

export const DATASETS: DatasetDescriptor[] = [population, medelalder, medianinkomst, stateExpenses, kpi];

export function getDatasetsForLevel(level: AdminLevel): DatasetDescriptor[] {
  return DATASETS.filter((d) => d.supportedLevels.includes(level));
}
