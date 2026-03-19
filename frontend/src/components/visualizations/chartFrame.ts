import * as d3 from 'd3';
import { CT } from './chartTokens';

interface FrameOptions {
  /** y-coordinate of the top edge (default: 0) */
  yTop?: number;
  /** y-coordinate of the bottom edge (default: innerH) */
  yBottom?: number;
  /** Number of separators to draw (= rowCount - 1). Requires separatorY. */
  separatorCount?: number;
  /** Returns the y position of separator i (between row i and row i+1). */
  separatorY?: (i: number) => number;
  /** How far left of x=0 the horizontal borders extend (= margin.left). */
  leftExtend?: number;
}

/**
 * Draws the standard chart frame used by ranked-list style charts:
 * top border, bottom border, vertical shelf line, and optional row separators.
 *
 * Call this after row backgrounds and grid lines have been drawn so the
 * borders sit on top of everything structural.
 */
export function drawChartFrame(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: d3.Selection<SVGGElement, any, any, any>,
  innerW: number,
  innerH: number,
  options: FrameOptions = {},
): void {
  const {
    yTop         = 0,
    yBottom      = innerH,
    separatorCount,
    separatorY,
    leftExtend   = 0,
  } = options;

  // Top border.
  g.append('line')
    .attr('x1', -leftExtend).attr('x2', innerW)
    .attr('y1', yTop).attr('y2', yTop)
    .attr('stroke', CT.border).attr('stroke-width', 1);

  // Horizontal row separators.
  if (separatorCount && separatorCount > 0 && separatorY) {
    g.selectAll('line.sep')
      .data(d3.range(separatorCount))
      .join('line').attr('class', 'sep')
      .attr('x1', -leftExtend).attr('x2', innerW)
      .attr('y1', i => separatorY(i))
      .attr('y2', i => separatorY(i))
      .attr('stroke', CT.gridLine).attr('stroke-width', 0.5);
  }

  // Bottom border.
  g.append('line')
    .attr('x1', -leftExtend).attr('x2', innerW)
    .attr('y1', yBottom).attr('y2', yBottom)
    .attr('stroke', CT.border).attr('stroke-width', 1);

  // Vertical shelf line at label/chart boundary.
  g.append('line')
    .attr('x1', 0).attr('x2', 0)
    .attr('y1', yTop).attr('y2', yBottom)
    .attr('stroke', CT.border).attr('stroke-width', 1);
}
