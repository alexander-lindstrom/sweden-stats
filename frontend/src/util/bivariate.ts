// Joshua Stevens-style 3×3 bivariate palette.
// Rows = Y bins (0=low, 1=mid, 2=high), columns = X bins (0=low, 1=mid, 2=high).
// Blue axis = X (primary dataset), Purple axis = Y (secondary dataset).
export const BIVARIATE_PALETTE: [string, string, string][] = [
  ['#e8e8e8', '#ace4e4', '#5ac8c8'],  // y=low
  ['#dfb0d6', '#a5b4c2', '#5698b9'],  // y=mid
  ['#be64ac', '#8c62aa', '#3b4994'],  // y=high
];

const NO_DATA_COLOR = '#d4d4d4';

function tercileBreaks(values: number[]): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return [sorted[Math.floor(n / 3)], sorted[Math.floor((2 * n) / 3)]];
}

function bin3(value: number, breaks: [number, number]): 0 | 1 | 2 {
  if (value <= breaks[0]) { return 0; }
  if (value <= breaks[1]) { return 1; }
  return 2;
}

export function buildBivariateColorFn(
  xValues: Record<string, number>,
  yValues: Record<string, number>,
): (code: string) => string {
  const xVals = Object.values(xValues);
  const yVals = Object.values(yValues);
  if (xVals.length === 0 || yVals.length === 0) { return () => NO_DATA_COLOR; }

  const xBreaks = tercileBreaks(xVals);
  const yBreaks = tercileBreaks(yVals);

  return (code: string): string => {
    const x = xValues[code];
    const y = yValues[code];
    if (x === undefined || y === undefined) { return NO_DATA_COLOR; }
    return BIVARIATE_PALETTE[bin3(y, yBreaks)][bin3(x, xBreaks)];
  };
}
