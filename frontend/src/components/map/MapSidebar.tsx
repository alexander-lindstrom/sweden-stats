import { useState } from 'react';
import YearSlider from '@/components/common/YearSlider';
import { Dropdown } from '@/components/ui/Dropdown';
import { BaseMapKey, baseMaps, baseMapLabels } from '@/components/map/BaseMaps';
import { FilterPanel } from '@/components/map/FilterPanel';
import { ADMIN_LEVELS, LEVEL_LABELS } from '@/datasets/adminLevels';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
import type { AdminLevel, DatasetDescriptor, FilterCriterion } from '@/datasets/types';

interface MapSidebarProps {
  selectedLevel:          AdminLevel;
  onLevelChange:          (level: AdminLevel) => void;
  selectedDatasetId:      string | null;
  onDatasetChange:        (id: string) => void;
  activeDescriptor:       DatasetDescriptor | null;
  displayYear:            number;
  onYearChange:           (year: number) => void;
  selectedBase:           BaseMapKey;
  onBaseChange:           (base: BaseMapKey) => void;
  onReset:                () => void;
  desktopOpen:            boolean;
  mobileOpen:             boolean;
  onMobileClose:          () => void;
  filterEnabled:          boolean;
  onFilterEnabledChange:  (enabled: boolean) => void;
  filterCriteria:         FilterCriterion[];
  onFilterCriteriaChange: (criteria: FilterCriterion[]) => void;
  filterSortedValues:     Record<string, number[]>;
  filterMatchingCount:    number | null;
  filterLoading:          boolean;
  fillOpacity:            number;
  onFillOpacityChange:    (value: number) => void;
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5 px-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {children}
    </section>
  );
}

function CollapsibleSection({ label, children, defaultOpen = true }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-1.5 px-4 group"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap group-hover:text-slate-700 transition-colors">
          {label}
        </span>
        <div className="flex-1 h-px bg-slate-200 group-hover:bg-slate-300 transition-colors" />
        <svg
          className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 10 8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M1 2l4 4 4-4" />
        </svg>
      </button>
      {open && children}
    </section>
  );
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left py-1.5 pr-4 pl-3.5 text-sm transition-colors border-l-[3px]',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
          : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** Render datasets, collapsing any that share a `group` into one nav item + segmented sub-selector. */
function DatasetList({
  datasets,
  selectedDatasetId,
  onDatasetChange,
}: {
  datasets: DatasetDescriptor[];
  selectedDatasetId: string | null;
  onDatasetChange: (id: string) => void;
}) {
  // Partition into ungrouped items and groups (preserving order of first appearance).
  const order: Array<{ kind: 'single'; ds: DatasetDescriptor } | { kind: 'group'; key: string; items: DatasetDescriptor[] }> = [];
  const seenGroups = new Map<string, DatasetDescriptor[]>();

  for (const ds of datasets) {
    if (!ds.group) {
      order.push({ kind: 'single', ds });
    } else if (!seenGroups.has(ds.group)) {
      const items: DatasetDescriptor[] = [ds];
      seenGroups.set(ds.group, items);
      order.push({ kind: 'group', key: ds.group, items });
    } else {
      seenGroups.get(ds.group)!.push(ds);
    }
  }

  return (
    <ul>
      {order.map((entry) => {
        if (entry.kind === 'single') {
          return (
            <li key={entry.ds.id}>
              <NavItem active={selectedDatasetId === entry.ds.id} onClick={() => onDatasetChange(entry.ds.id)}>
                {entry.ds.label}
              </NavItem>
            </li>
          );
        }

        // Group entry
        const { key, items } = entry;
        const isGroupActive = items.some(d => d.id === selectedDatasetId);
        const groupLabel = items.find(d => d.groupLabel)?.groupLabel ?? key;

        return (
          <li key={key}>
            <NavItem
              active={isGroupActive}
              onClick={() => {
                // Keep currently selected item in group; otherwise pick first.
                const current = items.find(d => d.id === selectedDatasetId);
                onDatasetChange((current ?? items[0]).id);
              }}
            >
              {groupLabel}
            </NavItem>
            {isGroupActive && (
              <div className="flex gap-1 px-3.5 pb-2 pt-1">
                {items.map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => onDatasetChange(ds.id)}
                    className={[
                      'flex-1 text-xs py-0.5 rounded-md text-center transition-colors font-medium',
                      selectedDatasetId === ds.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {ds.shortLabel ?? ds.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MapSidebar({
  selectedLevel,
  onLevelChange,
  selectedDatasetId,
  onDatasetChange,
  activeDescriptor,
  displayYear,
  onYearChange,
  selectedBase,
  onBaseChange,
  onReset,
  desktopOpen,
  mobileOpen,
  onMobileClose,
  filterEnabled,
  onFilterEnabledChange,
  filterCriteria,
  onFilterCriteriaChange,
  filterSortedValues,
  filterMatchingCount,
  filterLoading,
  fillOpacity,
  onFillOpacityChange,
}: MapSidebarProps) {
  const availableDatasets = getDatasetsForLevel(selectedLevel);
  const filterableDatasets = DATASETS.filter(d =>
    d.group !== 'val' && d.supportedLevels.includes(selectedLevel),
  );

  return (
    <aside className={[
      // md+: always-visible inline push panel (hidden when desktopOpen is false)
      desktopOpen
        ? 'md:relative md:inset-auto md:z-auto md:translate-x-0 md:w-52 md:flex-shrink-0 md:border-r md:border-slate-200 md:bg-white md:flex md:flex-col md:overflow-y-auto md:[box-shadow:4px_0_12px_rgba(0,0,0,0.06)]'
        : 'md:hidden',
      // <md: fixed overlay sliding in from the left, starts below the top bar
      'fixed top-11 bottom-0 left-0 z-30 w-1/2 border-r border-slate-200 bg-white flex flex-col overflow-y-auto',
      'transition-transform duration-300 ease-out shadow-xl',
      mobileOpen ? 'translate-x-0' : '-translate-x-full',
    ].join(' ')}>

      {/* Wordmark — desktop only; on mobile the top bar stays visible above the sidebar */}
      <div className="h-11 hidden md:flex items-center px-4 border-b border-slate-200 flex-shrink-0">
        <button
          onClick={onReset}
          className="flex items-center gap-0 flex-1 hover:opacity-80 transition-opacity"
        >
          <span className="text-sm font-bold tracking-tight text-slate-800">Riks</span>
          <span className="text-sm font-bold tracking-tight text-blue-600">kartan</span>
        </button>
        <button
          onClick={onMobileClose}
          aria-label="Stäng meny"
          className="md:hidden text-slate-400 hover:text-slate-700 text-xl leading-none ml-2"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-5 py-4 flex-1">

        {/* Admin level — always visible, only 5 items */}
        <SidebarSection label="Nivå">
          <ul>
            {ADMIN_LEVELS.map((level) => (
              <li key={level}>
                <NavItem active={selectedLevel === level} onClick={() => onLevelChange(level)}>
                  {LEVEL_LABELS[level]}
                </NavItem>
              </li>
            ))}
          </ul>
        </SidebarSection>

        {/* Dataset */}
        <CollapsibleSection label="Dataset">
          {availableDatasets.length === 0 ? (
            <p className="text-xs text-slate-400 italic px-4">
              Inga dataset för denna nivå.
            </p>
          ) : (
            <DatasetList
              datasets={availableDatasets}
              selectedDatasetId={selectedDatasetId}
              onDatasetChange={onDatasetChange}
            />
          )}
        </CollapsibleSection>

        {/* Year slider */}
        {activeDescriptor && activeDescriptor.availableYears.length > 1 && !['RegSO', 'DeSO'].includes(selectedLevel) && (
          <section className="px-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap">År</span>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-sm font-semibold text-slate-700 tabular-nums">{displayYear}</span>
            </div>
            <YearSlider
              years={activeDescriptor.availableYears.map(String)}
              selectedYear={String(displayYear)}
              onYearChange={(y) => onYearChange(Number(y))}
            />
          </section>
        )}

        {/* Filter mode */}
        <CollapsibleSection label="Filter">
          <NavItem
            active={filterEnabled}
            onClick={() => onFilterEnabledChange(!filterEnabled)}
          >
            {filterEnabled ? 'Filter aktiverat' : 'Aktivera filter'}
          </NavItem>
          {filterEnabled && (
            <div className="mt-2">
              <FilterPanel
                criteria={filterCriteria}
                onCriteriaChange={onFilterCriteriaChange}
                sortedValues={filterSortedValues}
                filterableDatasets={filterableDatasets}
                matchingCount={filterMatchingCount}
                loading={filterLoading}
              />
            </div>
          )}
        </CollapsibleSection>

        {/* Base map — collapsed by default, least-used setting */}
        <CollapsibleSection label="Bakgrundskarta" defaultOpen={false}>
          <div className="px-4 flex flex-col gap-3">
            <Dropdown
              value={selectedBase}
              onChange={val => onBaseChange(val as BaseMapKey)}
              options={(['None', ...Object.keys(baseMaps)] as BaseMapKey[]).map(key => ({ value: key, label: baseMapLabels[key] }))}
            />
            {selectedBase !== 'None' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Datafyllnad</span>
                  <span className="text-xs font-medium text-slate-700 tabular-nums">
                    {Math.round(fillOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(fillOpacity * 100)}
                  onChange={e => onFillOpacityChange(Number(e.target.value) / 100)}
                  className="w-full accent-blue-500"
                />
              </div>
            )}
          </div>
        </CollapsibleSection>

      </div>
    </aside>
  );
}
