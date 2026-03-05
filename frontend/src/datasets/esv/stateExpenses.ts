import { AdminLevel, DatasetDescriptor, ScalarDatasetResult, GeoHierarchyNode } from '../types';

const EXPENSES_URL = 'http://localhost:3001/api/expenses';

interface RawNode {
  name:      string;
  value?:    number;
  children?: RawNode[];
}

/** Recursively maps the ESV tree to GeoHierarchyNode, summing child values for parent nodes. */
function mapNode(raw: RawNode): GeoHierarchyNode {
  if (raw.children && raw.children.length > 0) {
    const children = raw.children
      .map(mapNode)
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
    const value = children.reduce((sum, c) => sum + c.value, 0);
    return { code: raw.name, name: raw.name, value, children };
  }
  return { code: raw.name, name: raw.name, value: Math.max(0, raw.value ?? 0) };
}

async function fetchExpensesHierarchy(year: number): Promise<GeoHierarchyNode> {
  const res = await fetch(`${EXPENSES_URL}/${year}`);
  if (!res.ok) {
    throw new Error(`Expenses API error: ${res.status} ${res.statusText}`);
  }
  const data: RawNode = await res.json();
  return mapNode(data);
}

const EMPTY_RESULT: ScalarDatasetResult = { kind: 'scalar', values: {}, labels: {}, label: 'Statens utgifter', unit: 'mnkr' };

async function fetchExpenses(_level: AdminLevel, _year: number): Promise<ScalarDatasetResult> {
  return EMPTY_RESULT;
}

export const stateExpenses: DatasetDescriptor = {
  id:             'state-expenses',
  label:          'Statens utgifter',
  source:         'ESV',
  availableYears: Array.from({ length: 28 }, (_, i) => 1997 + i), // 1997–2024
  supportedLevels: ['Country'],
  supportedViews:  ['chart'],
  chartTypes:      { Country: ['sunburst'] },
  // No sunburstDepthToLevel — ESV categories are not geographic levels.
  fetch:         fetchExpenses,
  fetchHierarchy: fetchExpensesHierarchy,
};
