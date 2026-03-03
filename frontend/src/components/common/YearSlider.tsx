import React from 'react';

type YearSliderProps = {
  years: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
  label?: string;
};

const YearSlider: React.FC<YearSliderProps> = ({ years, selectedYear, onYearChange, label }) => {
  if (!years || years.length === 0) { return null; }

  const min           = 0;
  const max           = years.length - 1;
  const selectedIndex = years.indexOf(selectedYear);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (years[idx]) { onYearChange(years[idx]); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-xs text-slate-500">{label}: {selectedYear}</span>
      )}
      <input
        type="range"
        id="year-slider"
        min={min}
        max={max}
        value={selectedIndex}
        step="1"
        onChange={handleChange}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-600
                   bg-slate-200 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-sm"
      />
      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
        <span>{years[0]}</span>
        <span>{years[years.length - 1]}</span>
      </div>
    </div>
  );
};

export default YearSlider;
