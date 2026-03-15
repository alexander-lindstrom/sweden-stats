import { BIVARIATE_PALETTE } from '@/util/bivariate';

interface BivariateMapLegendProps {
  xLabel: string;
  yLabel: string;
}

const CELL = 22;
const GRID_PX = CELL * 3;
// Width of the "hög/låg" column to the left of the grid
const Y_AXIS_W = 28;
const GAP = 6;

export default function BivariateMapLegend({ xLabel, yLabel }: BivariateMapLegendProps) {
  return (
    <div className="flex flex-col select-none" style={{ gap: 4 }}>

      {/* Y variable name — sits above the grid, offset to align with grid not the axis label col */}
      <div className="flex items-center gap-1" style={{ paddingLeft: Y_AXIS_W + GAP }}>
        <span className="text-[10px] text-slate-400">↑</span>
        <span className="text-[11px] text-slate-600 leading-snug">{yLabel}</span>
      </div>

      {/* Grid body row: Y hög/låg labels + 3×3 grid */}
      <div className="flex items-stretch" style={{ gap: GAP }}>
        {/* Y-axis low/high */}
        <div className="flex flex-col justify-between items-end" style={{ width: Y_AXIS_W }}>
          <span className="text-[10px] text-slate-400 leading-none">hög</span>
          <span className="text-[10px] text-slate-400 leading-none">låg</span>
        </div>

        {/* 3×3 grid — rows top-to-bottom = y=high first */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${CELL}px)`, gridTemplateRows: `repeat(3, ${CELL}px)`, width: GRID_PX, height: GRID_PX }}>
          {[2, 1, 0].map(yBin =>
            [0, 1, 2].map(xBin => (
              <div
                key={`${yBin}-${xBin}`}
                style={{ backgroundColor: BIVARIATE_PALETTE[yBin][xBin], width: CELL, height: CELL }}
              />
            ))
          )}
        </div>
      </div>

      {/* X-axis low/high labels — aligned under the grid */}
      <div className="flex justify-between" style={{ paddingLeft: Y_AXIS_W + GAP, width: Y_AXIS_W + GAP + GRID_PX }}>
        <span className="text-[10px] text-slate-400 leading-none">låg</span>
        <span className="text-[10px] text-slate-400 leading-none">hög</span>
      </div>

      {/* X variable name — below the grid, offset to align */}
      <div className="flex items-center gap-1" style={{ paddingLeft: Y_AXIS_W + GAP }}>
        <span className="text-[10px] text-slate-400">→</span>
        <span className="text-[11px] text-slate-600 leading-snug">{xLabel}</span>
      </div>

    </div>
  );
}
