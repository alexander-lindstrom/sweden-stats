import type { AdminLevel } from './types';

export const ADMIN_LEVELS: AdminLevel[] = ['Country', 'Region', 'Municipality', 'RegSO', 'DeSO'];

export const LEVEL_LABELS: Record<AdminLevel, string> = {
  Country:      'Nationell',
  Region:       'Län',
  Municipality: 'Kommun',
  RegSO:        'RegSO',
  DeSO:         'DeSO',
};

// Stable county code → short name mapping (without "län" suffix or genitive "s").
export const COUNTY_NAMES: Record<string, string> = {
  '01': 'Stockholm',    '03': 'Uppsala',        '04': 'Södermanland',
  '05': 'Östergötland', '06': 'Jönköping',      '07': 'Kronoberg',
  '08': 'Kalmar',       '09': 'Gotland',         '10': 'Blekinge',
  '12': 'Skåne',        '13': 'Halland',         '14': 'Västra Götaland',
  '17': 'Värmland',     '18': 'Örebro',          '19': 'Västmanland',
  '20': 'Dalarna',      '21': 'Gävleborg',       '22': 'Västernorrland',
  '23': 'Jämtland',     '24': 'Västerbotten',    '25': 'Norrbotten',
};
