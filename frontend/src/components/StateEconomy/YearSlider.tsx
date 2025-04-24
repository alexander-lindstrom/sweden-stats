import React from 'react';

type YearSliderProps = {
  years: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
  label?: string;
};

const YearSlider: React.FC<YearSliderProps> = ({ 
  years, 
  selectedYear, 
  onYearChange, 
  label 
}) => {
  if (!years || years.length === 0) {
    return <div>No year data available.</div>;
  }

  const min = 0;
  const max = years.length - 1;
  const selectedIndex = years.indexOf(selectedYear);

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value, 10);
    if (years[newIndex]) {
      onYearChange(years[newIndex]);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
      {label && (
        <label htmlFor="year-slider">
          {label}: {selectedYear}
        </label>
      )}
      <input
        type="range"
        id="year-slider"
        min={min}
        max={max}
        value={selectedIndex}
        onChange={handleSliderChange}
        step="1"
        style={{ flexGrow: 1 }}
      />
    </div>
  );
};

export default YearSlider;