/**
 * Shared visual tokens for D3 chart components.
 * Use these instead of hardcoding hex strings so that style changes
 * propagate automatically and drift (like the #f3f4f6 vs #e5e7eb issue)
 * cannot silently accumulate.
 */
export const CT = {
  // Structure
  gridLine:    '#e5e7eb', // grid lines & row separators
  border:      '#d1d5db', // frame borders & shelf line

  // Text
  tickText:    '#9ca3af', // axis tick labels
  axisLabel:   '#6b7280', // axis title text
  labelText:   '#374151', // row / item labels (default)

  // Interaction
  selected:    '#1e40af', // selected feature
  comparison:  '#f97316', // comparison feature

  // Diverging bar chart (above/below mean)
  divergingLow:  '#60a5fa', // blue-400  — below average
  divergingHigh: '#fb923c', // orange-400 — above average

  // Default fill when no colour scale is provided
  defaultFill: '#3b82f6',

  // Gender palette (population pyramid)
  menFill:   '#3b82f6', // blue-500
  womenFill: '#f43f5e', // rose-500
} as const;
