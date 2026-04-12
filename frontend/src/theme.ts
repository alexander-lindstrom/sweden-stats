/**
 * UI design tokens for JSX/Tailwind components.
 * Mirrors the CT convention in chartTokens.ts (which covers SVG/D3 contexts).
 * Import UI here; import CT for chart internals.
 */
export const UI = {
  // ── Cards & containers ───────────────────────────────────────────────────
  /** Standard card — used in Profile tab (spacious). */
  card:        'rounded-xl bg-slate-50 border border-slate-200 p-4 shadow-sm',
  /** Compact card — used in SelectionPanel sidebar. */
  cardCompact: 'rounded-xl bg-slate-50 border border-slate-200 p-3 shadow-sm',

  // ── Section headings ─────────────────────────────────────────────────────
  /** Profile-tab section title (collapsible header label). */
  sectionTitle: 'text-sm font-bold uppercase tracking-[0.10em] text-slate-500 whitespace-nowrap',

  // ── Stat display (StatMini, future stat cards) ───────────────────────────
  statValue: 'text-xl font-bold tabular-nums text-slate-900',
  statUnit:  'text-xs text-slate-500',

  // ── Delta indicators ─────────────────────────────────────────────────────
  /** Above average — matches Sparkline upward-trend colour (#22c55e). */
  deltaPositive: 'text-emerald-600',
  /** Below average — matches Sparkline downward-trend colour (#ef4444). */
  deltaNegative: 'text-rose-600',
  deltaNeutral:  'text-slate-400',

  // ── Tooltips ─────────────────────────────────────────────────────────────
  /** Matches the RankedBarChart/ScatterPlot hover tooltip style. */
  tooltip: 'fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg',
} as const;
