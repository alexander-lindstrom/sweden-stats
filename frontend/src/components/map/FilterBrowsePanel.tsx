import { useMemo } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { X } from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { DATASETS } from '@/datasets/registry';
import { percentileOf, valueAtPercentile } from '@/hooks/useFilterMode';
import type { AdminLevel, DatasetDescriptor, FilterCriterion } from '@/datasets/types';

// ── Criterion row ─────────────────────────────────────────────────────────────

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
    const newThreshold = valueAtPercentile(pct, sortedVals);
    if (newThreshold === criterion.absoluteThreshold) { return; }
    onUpdate({ ...criterion, absoluteThreshold: newThreshold });
  };

  const handleAbsoluteChange = (raw: string) => {
    const value = parseFloat(raw);
    onUpdate({ ...criterion, absoluteThreshold: Number.isFinite(value) ? value : NaN });
  };

  const absDisplay = Number.isFinite(criterion.absoluteThreshold)
    ? String(criterion.absoluteThreshold)
    : '';

  const datasetOptions = filterableDatasets.map(d => ({ value: d.id, label: d.label }));

  return (
    <div className="px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Dataset selector */}
          <Dropdown
            inputSize="sm"
            value={criterion.datasetId}
            onChange={id => onUpdate({ ...criterion, datasetId: id, absoluteThreshold: NaN })}
            options={datasetOptions}
          />

          {/* Direction toggle + current value */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdate({ ...criterion, direction: criterion.direction === 'above' ? 'below' : 'above' })}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
            >
              <span>{criterion.direction === 'above' ? '≥ Över' : '≤ Under'}</span>
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 10 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M5 1v12M2 4l3-3 3 3M2 10l3 3 3-3" />
              </svg>
            </button>

            <input
              type="text"
              inputMode="decimal"
              value={absDisplay}
              disabled={!hasData}
              onChange={e => handleAbsoluteChange(e.target.value)}
              placeholder="—"
              className="flex-1 min-w-0 text-xs border border-slate-200 rounded-md px-2 py-1 text-right tabular-nums text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:text-slate-400 disabled:bg-slate-50"
            />

            {hasData && Number.isFinite(criterion.absoluteThreshold) && (
              <span className="text-[11px] font-semibold text-blue-600 tabular-nums flex-shrink-0">
                p{sliderPct}
              </span>
            )}
          </div>

          {/* Percentile slider */}
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

        {/* Remove */}
        <button
          onClick={onRemove}
          aria-label="Ta bort villkor"
          className="flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors rounded hover:bg-red-50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface FilterBrowsePanelProps {
  open:                  boolean;
  onClose:               () => void;
  selectedLevel:         AdminLevel;
  filterEnabled:         boolean;
  onFilterEnabledChange: (enabled: boolean) => void;
  criteria:              FilterCriterion[];
  onCriteriaChange:      (criteria: FilterCriterion[]) => void;
  sortedValues:          Record<string, number[]>;
  matchingCount:         number | null;
  loading:               boolean;
}

export function FilterBrowsePanel({
  open,
  onClose,
  selectedLevel,
  filterEnabled,
  onFilterEnabledChange,
  criteria,
  onCriteriaChange,
  sortedValues,
  matchingCount,
  loading,
}: FilterBrowsePanelProps) {
  const filterableDatasets = useMemo(
    () => DATASETS.filter(d => d.group !== 'val' && d.supportedLevels.includes(selectedLevel)),
    [selectedLevel],
  );

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

  if (!open) { return null; }

  const activeCriteria = criteria.filter(c => Number.isFinite(c.absoluteThreshold));

  if (filterableDatasets.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-16 px-4 pb-8"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm"
          onClick={e => e.stopPropagation()}
        >
          Inga filterbara dataset för denna nivå.
        </div>
      </div>
    );
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-16 px-4 pb-8"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 8rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Filtrera</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {activeCriteria.length > 0
                ? `${activeCriteria.length} ${activeCriteria.length === 1 ? 'aktivt' : 'aktiva'} villkor`
                : 'Filtrera områden efter datavärden'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Enable toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{filterEnabled ? 'På' : 'Av'}</span>
              <Switch.Root
                checked={filterEnabled}
                onCheckedChange={onFilterEnabledChange}
                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/30 data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-slate-300"
              >
                <Switch.Thumb className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ease-in-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
              </Switch.Root>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {criteria.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400 text-sm">
              Inga villkor ännu. Lägg till ett villkor för att filtrera på kartan.
            </div>
          ) : (
            criteria.map((criterion, index) => (
              <CriterionRow
                key={index}
                criterion={criterion}
                sortedVals={sortedValues[criterion.datasetId] ?? null}
                filterableDatasets={filterableDatasets}
                onUpdate={c => handleUpdate(index, c)}
                onRemove={() => handleRemove(index)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={handleAdd}
            className="text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 border border-dashed border-slate-300 hover:border-blue-300 rounded-lg transition-colors"
          >
            + Lägg till villkor
          </button>

          {matchingCount !== null && criteria.length > 0 && (
            <span className="text-xs tabular-nums text-slate-500">
              {loading ? 'Laddar…' : `${matchingCount} träffar`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
