/**
 * Single sv-SE number formatting entry point.
 *
 * Every number that reaches the screen — React text, D3 axis ticks, legends,
 * tooltips — should go through here so the app never mixes en-US output
 * ("200,000", "10.6M") with sv-SE output ("2 473 307", "349,6").
 */

const LOCALE = 'sv-SE';
const cache  = new Map<string, Intl.NumberFormat>();

function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, options);
    cache.set(key, f);
  }
  return f;
}

/** Decimal places that keep a value readable without false precision. */
export function autoDecimals(v: number): number {
  const a = Math.abs(v);
  if (Number.isInteger(v) || a >= 1000) { return 0; }
  if (a >= 1) { return 1; }
  return 2;
}

/** Full number with sv-SE grouping: 2 473 307 · 349,6 · 0,85 */
export function formatNumber(v: number, decimals: number = autoDecimals(v)): string {
  return nf({ minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(v);
}

/** Compact number for axis ticks and legends: 2,5 mn · 350 tn · 34,5 */
export function formatCompact(v: number): string {
  if (Math.abs(v) >= 10_000) {
    return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }
  return formatNumber(v);
}

/** Value followed by its unit. Large mnkr amounts are promoted to mdkr. */
export function formatWithUnit(v: number, unit: string, compact = false): string {
  if (unit === 'mnkr' && Math.abs(v) >= 1000) {
    return `${formatNumber(v / 1000, Math.abs(v) >= 100_000 ? 0 : 1)} mdkr`;
  }
  const n = compact ? formatCompact(v) : formatNumber(v);
  return unit ? `${n} ${unit}` : n;
}

/** Share with a fixed number of decimals: 34,5 % */
export function formatPercent(v: number, decimals = 1): string {
  return `${formatNumber(v, decimals)} %`;
}

/** Explicitly signed value for deltas: +1 200 · −3,4 · 0 */
export function formatSigned(v: number, decimals?: number): string {
  const s = formatNumber(Math.abs(v), decimals);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
