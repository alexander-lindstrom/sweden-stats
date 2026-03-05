/** Party metadata for Swedish election datasets. */

export const ELECTION_YEARS = [
  1973, 1976, 1979, 1982, 1985, 1988, 1991, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
] as const;

/** Canonical party display order. */
export const PARTY_CODES = ['S', 'M', 'SD', 'C', 'V', 'KD', 'MP', 'L', 'ÖVRIGA'] as const;
export type PartyCode = (typeof PARTY_CODES)[number];

/** Official party colors. */
export const PARTY_COLORS: Record<string, string> = {
  S:      '#E8112d',
  M:      '#52BDEC',
  SD:     '#DDDD00',
  C:      '#009933',
  V:      '#AF0000',
  KD:     '#231977',
  MP:     '#83CF39',
  L:      '#006AB3',
  ÖVRIGA: '#AAAAAA',
};

/** Swedish display names. */
export const PARTY_LABELS: Record<string, string> = {
  S:      'Socialdemokraterna',
  M:      'Moderaterna',
  SD:     'Sverigedemokraterna',
  C:      'Centerpartiet',
  V:      'Vänsterpartiet',
  KD:     'Kristdemokraterna',
  MP:     'Miljöpartiet',
  L:      'Liberalerna',
  ÖVRIGA: 'Övriga',
};

/** Pre-2015 SCB codes → canonical codes. */
const PARTY_ALIAS: Record<string, string> = {
  FP:  'L',      // Folkpartiet → Liberalerna (2015 rename)
  NYD: 'ÖVRIGA', // Ny demokrati (1991–1994)
};

export function normalizePartyCode(code: string): string {
  return PARTY_ALIAS[code] ?? code;
}
