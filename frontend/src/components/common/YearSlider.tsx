import * as SliderPrimitive from '@radix-ui/react-slider';

type YearSliderProps = {
  years: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
};

export default function YearSlider({ years, selectedYear, onYearChange }: YearSliderProps) {
  if (!years || years.length === 0) return null;

  const idx = years.indexOf(selectedYear);
  const value = idx < 0 ? 0 : idx;

  return (
    <div className="flex flex-col gap-2">
      <SliderPrimitive.Root
        min={0}
        max={years.length - 1}
        step={1}
        value={[value]}
        onValueChange={([i]) => { if (years[i]) onYearChange(years[i]); }}
        className="relative flex items-center select-none touch-none w-full h-4"
      >
        <SliderPrimitive.Track className="relative grow rounded-full h-1.5 bg-slate-200">
          <SliderPrimitive.Range className="absolute rounded-full h-full bg-blue-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="År"
          className="block w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-sm
                     hover:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30
                     transition-colors"
        />
      </SliderPrimitive.Root>
      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
        <span>{years[0]}</span>
        <span>{years[years.length - 1]}</span>
      </div>
    </div>
  );
}
