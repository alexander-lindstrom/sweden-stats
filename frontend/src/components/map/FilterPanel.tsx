import type { DatasetDescriptor, FilterCriterion } from '@/datasets/types';
import { percentileOf, valueAtPercentile } from '@/hooks/useFilterMode';

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

  return (
    <div className="border border-slate-200 rounded-md p-2.5 bg-white space-y-2">
      {/* Dataset selector + remove */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <select
            value={criterion.datasetId}
            onChange={e => handleDatasetChange(e.target.value)}
            className="w-full appearance-none text-xs border border-slate-200 rounded px-2 py-1 pr-5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 truncate"
          >
            {filterableDatasets.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 text-slate-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <button
          onClick={onRemove}
          aria-label="Ta bort villkor"
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors rounded hover:bg-red-50 text-base leading-none"
        >
          ×
        </button>
      </div>

      {/* Direction toggle */}
      <div className="flex gap-1">
        {(['above', 'below'] as const).map(dir => (
          <button
            key={dir}
            onClick={() => onUpdate({ ...criterion, direction: dir })}
            className={[
              'flex-1 text-xs py-0.5 rounded transition-colors',
              criterion.direction === dir
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
            ].join(' ')}
          >
            {dir === 'above' ? '≥ Över' : '≤ Under'}
          </button>
        ))}
      </div>

      {/* Percentile slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Percentil</span>
          {hasData && (
            <span className="text-[11px] text-slate-600 tabular-nums">
              {Number.isFinite(criterion.absoluteThreshold) ? `p${sliderPct}` : '—'}
            </span>
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
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider whitespace-nowrap">Värde</span>
        <input
          type="number"
          value={absDisplay}
          disabled={!hasData}
          onChange={e => handleAbsoluteChange(e.target.value)}
          placeholder="—"
          className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-0.5 text-right tabular-nums text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:text-slate-400 disabled:bg-slate-50"
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
        className="w-full text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 py-1.5 border border-dashed border-slate-300 hover:border-blue-300 rounded-md transition-colors"
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
