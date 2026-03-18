/** Walk up the DOM to find the nearest scrollable ancestor. */
export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') { return node; }
    node = node.parentElement;
  }
  return null;
}
