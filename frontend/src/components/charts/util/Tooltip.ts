let tooltipDiv: HTMLDivElement | null = null;

export const setupTooltip = (): void => {
  if (!tooltipDiv && typeof document !== 'undefined') { // Check for document existence (SSR safety)
    // Check if it already exists from another chart instance
    tooltipDiv = document.querySelector<HTMLDivElement>('.chart-tooltip');
    if (!tooltipDiv) {
        tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'chart-tooltip'; // Apply CSS class
        document.body.appendChild(tooltipDiv);
    }
    // Ensure initial state is hidden
    tooltipDiv.style.opacity = '0';
    tooltipDiv.style.visibility = 'hidden';
  }
};

export const showTooltip = (event: MouseEvent, content: string): void => {
  if (!tooltipDiv) {
    setupTooltip(); // Ensure it exists
  }
  if (!tooltipDiv) {
    return; // Guard if setup failed
  }

  tooltipDiv.style.opacity = '1';
  tooltipDiv.style.visibility = 'visible';
  // Position relative to the mouse pointer
  tooltipDiv.style.left = `${event.pageX + 10}px`;
  tooltipDiv.style.top = `${event.pageY + 10}px`;
  tooltipDiv.innerHTML = content; // Set the content
};

export const hideTooltip = (): void => {
  if (!tooltipDiv) {
    return;
  }
  tooltipDiv.style.opacity = '0';
  // Keep visibility: hidden to prevent ghost interactions if opacity transition is slow
  tooltipDiv.style.visibility = 'hidden';
};

// Optional: Cleanup function if charts using it might unmount independently often.
// However, since it's appended to body, it might be okay to leave it.
// If used, call this in the useEffect cleanup return function.
export const cleanupTooltip = (): void => {
    if (tooltipDiv && document.body.contains(tooltipDiv)) {
        // Only remove if no other chart might be using it.
        // This simple version might remove it prematurely if multiple charts are present.
        // A ref-counting approach would be more robust but adds complexity.
        // For now, let's assume it's okay to leave it or manage cleanup carefully.
        // document.body.removeChild(tooltipDiv);
        // tooltipDiv = null;
    }
}