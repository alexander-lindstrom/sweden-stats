/**
 * Strip the Swedish county suffix ("s län" / " län") from a label.
 * Safe to call on any label — no-op when the suffix is absent.
 * Examples:
 *   "Gotlands län"     → "Gotland"
 *   "Kalmar län"       → "Kalmar"
 *   "Stockholms län"   → "Stockholm"
 *   "Upplands Väsby"   → "Upplands Väsby"  (no-op)
 */
export function stripLanSuffix(label: string): string {
  return label.replace(/s? län$/i, '');
}

/**
 * Clean a county/region label that may come in either of two forms:
 *   "Norrbottens län"  →  "Norrbotten"  (GeoServer returns full name)
 *   "Norrbottens"      →  "Norrbotten"  (GeoServer already stripped "län")
 *   "Kalmar län"       →  "Kalmar"
 *   "Kalmar"           →  "Kalmar"      (no-op)
 *
 * Only use this for known Region-level labels; the trailing-s strip is
 * not safe to apply generically (e.g. "Grums" municipality must stay "Grums").
 */
export function cleanCountyLabel(label: string): string {
  return label.replace(/s? län$/i, '').replace(/s$/, '');
}

/**
 * Strip a matched outer pair of parentheses wrapping an entire label.
 * "Vilunda västra"          → "Vilunda västra"  (no-op, no parens)
 * "(Vilunda västra)"        → "Vilunda västra"
 * "(Upplands Väsby omland)" → "Upplands Väsby omland"
 * "(Foo) och (Bar)"         → "(Foo) och (Bar)"  (no-op, inner paren present)
 */
export function stripOuterParens(label: string): string {
  return label.replace(/^\(([^)]+)\)$/, '$1');
}

/**
 * Strip a common leading word-prefix shared by every label in the array.
 * Useful for removing the redundant municipality name from RegSO labels
 * when all labels in view belong to the same municipality.
 *
 * "Upplands Väsby A"   ─┐
 * "Upplands Väsby B"   ─┤  → ["A", "B", "C"]
 * "Upplands Väsby C"   ─┘
 *
 * Only strips whole words (space-separated tokens).
 * Stops as soon as a token differs or only 1 token would remain.
 */
export function stripCommonPrefix(labels: string[]): string[] {
  if (labels.length === 0) { return labels; }

  const split = labels.map(l => l.split(' '));
  const minLen = Math.min(...split.map(t => t.length));

  let prefixLen = 0;
  outer: for (let i = 0; i < minLen - 1; i++) {
    const token = split[0][i];
    for (let j = 1; j < split.length; j++) {
      if (split[j][i] !== token) { break outer; }
    }
    prefixLen++;
  }

  if (prefixLen === 0) { return labels; }
  return split.map(tokens => tokens.slice(prefixLen).join(' '));
}
