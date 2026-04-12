import type { DatasetDescriptor, FilterCriterion } from '@/datasets/types';
import { percentileOf, valueAtPercentile } from '@/hooks/useFilterMode';
import { Dropdown } from '@/components/ui/Dropdown';
import { SectionLabel } from '@/components/ui/SectionLabel';

interface CriterionRowProps {
  criterion:          FilterCriterion;
  sortedVals:         number[] | null;
  filterableDatasets: DatasetDescriptor[];
  onUpdate:           (updated: FilterCriterion) => void;
  onRemove:           () => void;
}

function CriterionRow({ criterion, sortedVals, filterableDatasets, onUpdate, onRemove }: CriterionRowProps) {
  const hasData   = sortedVals !== null && sortedVals.length > 0;
  const sliderPct = hasData && Number.isFinite(criterion.absoluteThreshold)
    ? percentileOf(criterion.absoluteThreshold, sortedVals!)
    : 0;

  const handleSliderChange = (pct: number) => {
    if (!sortedVals) { return; }
    onUpdate({ ...criterion, absoluteThreshold: valueAtPercentile(pct, sortedVals) });
  };

  const handleAbsoluteChange = (raw: string) => {
    const value = parseFloat(raw);
    onUpdate({ ...criterion, absoluteThreshold: Number.isFinite(value) ? value : NaN });
  };

  const handleDatasetChange = (id: string) => {
    onUpdate({ ...criterion, datasetId: id, absoluteThreshold: NaN });
  };

  const absDisplay = Number.isFinite(criterion.absoluteThreshold)
    ? String(criterion.absoluteThreshold)
    : '';

  const datasetOptions = filterableDatasets.map(d => ({ value: d.id, label: d.label }));

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm space-y-2.5 relative">
      {/* Remove button — top-right of card */}
      <button
        onClick={onRemove}
        aria-label="Ta bort villkor"
        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors rounded hover:bg-red-50 text-base leading-none"
      >
        ×
      </button>

      {/* Dataset selector */}
      <Dropdown
        inputSize="sm"
        value={criterion.datasetId}
        onChange={handleDatasetChange}
        options={datasetOptions}
        wrapperClassName="pr-6"
      />

      {/* Direction — single toggle button */}
      <button
        onClick={() => onUpdate({ ...criterion, direction: criterion.direction === 'above' ? 'below' : 'above' })}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <span>{criterion.direction === 'above' ? '≥ Över' : '≤ Under'}</span>
        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 10 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M5 1v12M2 4l3-3 3 3M2 10l3 3 3-3" />
        </svg>
      </button>

      {/* Percentile slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <SectionLabel>Percentil</SectionLabel>
          {hasData && Number.isFinite(criterion.absoluteThreshold) && (
            <span className="text-[11px] font-semibold text-blue-600 tabular-nums">p{sliderPct}</span>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderPct}
          disabled={!hasData}
          onChange={e => handleSliderChange(Number(e.target.value))}
          className="w-full h-1.5 accent-blue-500 disabled:opacity-40"
        />
      </div>

      {/* Absolute value input */}
      <div className="flex items-center gap-2">
        <SectionLabel className="whitespace-nowrap">Värde</SectionLabel>
        <input
          type="text"
          inputMode="decimal"
          value={absDisplay}
          disabled={!hasData}
          onChange={e => handleAbsoluteChange(e.target.value)}
          placeholder="—"
          className="flex-1 min-w-0 text-xs border border-slate-200 rounded-md px-2 py-0.5 text-right tabular-nums text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:text-slate-400 disabled:bg-slate-50"
        />
      </div>
    </div>
  );
}

interface FilterPanelProps {
  criteria:           FilterCriterion[];
  onCriteriaChange:   (criteria: FilterCriterion[]) => void;
  sortedValues:       Record<string, number[]>;
  filterableDatasets: DatasetDescriptor[];
  matchingCount:      number | null;
  loading:            boolean;
}

export function FilterPanel({
  criteria,
  onCriteriaChange,
  sortedValues,
  filterableDatasets,
  matchingCount,
  loading,
}: FilterPanelProps) {
  if (filterableDatasets.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic px-4">
        Inga filterbara dataset för denna nivå.
      </p>
    );
  }

  const handleUpdate = (index: number, updated: FilterCriterion) => {
    onCriteriaChange(criteria.map((c, i) => (i === index ? updated : c)));
  };

  const handleRemove = (index: number) => {
    onCriteriaChange(criteria.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const defaultId = filterableDatasets[0]?.id ?? '';
    onCriteriaChange([...criteria, { datasetId: defaultId, absoluteThreshold: NaN, direction: 'above' }]);
  };

  return (
    <div className="space-y-2 px-4">
      {criteria.map((criterion, index) => {
        return (
          <CriterionRow
            key={index}
            criterion={criterion}
            sortedVals={sortedValues[criterion.datasetId] ?? null}
            filterableDatasets={filterableDatasets}
            onUpdate={c => handleUpdate(index, c)}
            onRemove={() => handleRemove(index)}
          />
        );
      })}

      <button
        onClick={handleAdd}
        className="w-full text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 py-2 border border-dashed border-slate-300 hover:border-blue-300 rounded-lg transition-colors"
      >
        + Lägg till villkor
      </button>

      {matchingCount !== null && (
        <p className="text-xs text-center py-0.5 tabular-nums text-slate-500">
          {loading ? 'Laddar…' : `${matchingCount} träffar`}
        </p>
      )}
    </div>
  );
}
