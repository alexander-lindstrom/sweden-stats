import { useRef } from 'react';
import useResizeObserver from './useResizeObserver';

/**
 * Shared setup hook for D3 chart components.
 * Manages the container/SVG refs and resize observer in one place.
 */
export function useChartBase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const dimensions   = useResizeObserver(containerRef);
  return { containerRef, svgRef, dimensions };
}
