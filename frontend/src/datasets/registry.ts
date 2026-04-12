import { AdminLevel, DatasetDescriptor } from './types';
import { population } from './scb/population';
import { medelalder } from './scb/medelalder';
import { medianinkomst } from './scb/medianinkomst';
import { utlandskBakgrund } from './scb/utlandsk_bakgrund';
import { sysselsattning } from './scb/sysselsattning';
import { stateExpenses } from './esv/stateExpenses';
import { kpi } from './scb/kpi';
import { riksdagsval, regionval, kommunval } from './scb/elections';
import { utbildningsniva } from './scb/utbildningsniva';
import { gymnasiebetyg } from './scb/gymnasiebetyg';
import { hogskolestudenter, hogskolestudenterAntal } from './scb/hogskolestudenter';
import { konsfordelning } from './scb/konsfordelning';
import { kommunalskatt } from './kolada/kommunalskatt';
import { grundskolaMerit } from './kolada/grundskolaMerit';
import { valdeltagande } from './kolada/valdeltagande';
import { ekonomisktBistand } from './kolada/ekonomisktBistand';
import { aldreomsorg } from './kolada/aldreomsorg';

export const DATASETS: DatasetDescriptor[] = [
  population, medelalder, medianinkomst, utlandskBakgrund, sysselsattning,
  utbildningsniva, konsfordelning, gymnasiebetyg, hogskolestudenterAntal, hogskolestudenter,
  stateExpenses, kpi,
  riksdagsval, regionval, kommunval,
  kommunalskatt, grundskolaMerit, valdeltagande, ekonomisktBistand, aldreomsorg,
];

export function getDatasetsForLevel(level: AdminLevel): DatasetDescriptor[] {
  return DATASETS.filter((d) => d.supportedLevels.includes(level));
}
