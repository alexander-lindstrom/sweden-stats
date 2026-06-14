import { JsonStat2Response } from '@/util/scb';

export interface MetadataResponse {
  dimension: Record<string, {
    category: {
      index: Record<string, number>;
      label: Record<string, string>;
    };
  }>;
}

export function buildReverseIndex(
  cat: { index: Record<string, number> },
): Record<number, string> {
  const map: Record<number, string> = {};
  for (const [code, idx] of Object.entries(cat.index)) { map[idx] = code; }
  return map;
}

export function buildStrides(sizes: number[]): number[] {
  const strides: number[] = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  return strides;
}

export function parseScbValue(raw: number | null | string | undefined): number | null {
  if (raw === null || raw === undefined) { return null; }
  const num = typeof raw === 'number' ? raw : parseFloat(raw as string);
  return isNaN(num) ? null : num;
}

export async function postScbQuery(
  url: string,
  selection: Array<{ variableCode: string; valueCodes: string[] }>,
): Promise<JsonStat2Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selection }),
  });
  if (!res.ok) { throw new Error(`SCB POST failed: ${res.status}`); }
  return res.json();
}
