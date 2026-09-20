/** User-facing wording for a failed dataset fetch. */

/** True for an aborted-by-timeout fetch or a gateway timeout from our proxy. */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'TimeoutError') { return true; }
  const message = err instanceof Error ? err.message : String(err);
  return /\b50[24]\b|timed?\s?out/i.test(message);
}

/** "Kunde inte hämta Folkmängd från SCB." plus a reason when we know one. */
export function describeFetchError(what: string, source: string, err: unknown): string {
  const base = `Kunde inte hämta ${what} från ${source}.`;
  return isTimeoutError(err) ? `${base} Källan svarade inte i tid.` : base;
}
