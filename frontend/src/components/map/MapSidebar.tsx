import YearSlider from '@/components/common/YearSlider';
import { BaseMapKey, baseMaps, baseMapLabels } from '@/components/map/BaseMaps';
import { FilterPanel } from '@/components/map/FilterPanel';
import { ADMIN_LEVELS, LEVEL_LABELS } from '@/datasets/adminLevels';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
import type { AdminLevel, DatasetDescriptor, FilterCriterion, ScalarDatasetResult } from '@/datasets/types';

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
  mobileOpen:             boolean;
  onMobileClose:          () => void;
  filterEnabled:          boolean;
  onFilterEnabledChange:  (enabled: boolean) => void;
  filterCriteria:         FilterCriterion[];
  onFilterCriteriaChange: (criteria: FilterCriterion[]) => void;
  filterFetchedDatasets:  Record<string, ScalarDatasetResult>;
  filterMatchingCount:    number | null;
  filterLoading:          boolean;
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 px-4">
        {label}
      </h2>
      {children}
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
          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
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
              <div className="flex gap-1 px-3.5 pb-2 pt-0.5">
                {items.map(ds => (
                  <button
                    key={ds.id}
                    onClick={() => onDatasetChange(ds.id)}
                    className={[
                      'flex-1 text-xs py-0.5 rounded text-center transition-colors',
                      selectedDatasetId === ds.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-slate-500 hover:bg-slate-200',
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
  mobileOpen,
  onMobileClose,
  filterEnabled,
  onFilterEnabledChange,
  filterCriteria,
  onFilterCriteriaChange,
  filterFetchedDatasets,
  filterMatchingCount,
  filterLoading,
}: MapSidebarProps) {
  const availableDatasets = getDatasetsForLevel(selectedLevel);
  const filterableDatasets = DATASETS.filter(d =>
    d.group !== 'val' && d.supportedLevels.includes(selectedLevel),
  );

  return (
    <aside className={[
      // Desktop: always-visible inline panel
      'sm:relative sm:inset-auto sm:z-auto sm:translate-x-0 sm:w-52 sm:flex-shrink-0',
      'sm:border-r sm:border-slate-200 sm:bg-slate-50 sm:flex sm:flex-col sm:overflow-y-auto',
      // Mobile: fixed full-height overlay sliding in from the left
      'fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto',
      'transition-transform duration-300 ease-out shadow-xl',
      mobileOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
    ].join(' ')}>

      {/* Wordmark */}
      <div className="h-11 flex items-center px-4 border-b border-slate-200 flex-shrink-0">
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
          className="sm:hidden text-slate-400 hover:text-slate-700 text-xl leading-none ml-2"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-5 py-4 flex-1">

        {/* Admin level */}
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
        <SidebarSection label="Dataset">
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
        </SidebarSection>

        {/* Year slider */}
        {activeDescriptor && activeDescriptor.availableYears.length > 1 && !['RegSO', 'DeSO'].includes(selectedLevel) && (
          <section className="px-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">År</h2>
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
        <SidebarSection label="Filter">
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
                fetchedDatasets={filterFetchedDatasets}
                filterableDatasets={filterableDatasets}
                matchingCount={filterMatchingCount}
                loading={filterLoading}
              />
            </div>
          )}
        </SidebarSection>

        {/* Base map */}
        <section className="px-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Bakgrundskarta
          </h2>
          <div className="relative">
            <select
              value={selectedBase}
              onChange={(e) => onBaseChange(e.target.value as BaseMapKey)}
              className="w-full appearance-none text-sm border border-slate-200 rounded-md px-3 py-1.5 pr-8 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            >
              {(['None', ...Object.keys(baseMaps)] as BaseMapKey[]).map((key) => (
                <option key={key} value={key}>{baseMapLabels[key]}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </section>

      </div>
    </aside>
  );
}
