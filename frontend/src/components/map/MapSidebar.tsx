import { useEffect, useMemo, useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Switch from '@radix-ui/react-switch';
import { ChevronDown, LibraryBig } from 'lucide-react';
import YearSlider from '@/components/common/YearSlider';
import { Dropdown } from '@/components/ui/Dropdown';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { BaseMapKey, baseMaps, baseMapLabels } from '@/components/map/BaseMaps';
import { FilterPanel } from '@/components/map/FilterPanel';
import { ADMIN_LEVELS, LEVEL_LABELS } from '@/datasets/adminLevels';
import { getDatasetsForLevel, DATASETS } from '@/datasets/registry';
import type { AdminLevel, DatasetCategory, DatasetDescriptor, FilterCriterion } from '@/datasets/types';
import { DATASET_CATEGORY_LABELS, DATASET_CATEGORY_ORDER } from '@/datasets/types';

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
  /** Extra descriptors to merge into the nav (e.g. user-pinned Kolada KPIs). */
  extraDatasets?:         DatasetDescriptor[];
  onOpenKoladaBrowse:     () => void;
}

// ─── Shared accordion section ─────────────────────────────────────────────────

function SidebarItem({
  value,
  label,
  children,
  onDimBg = false,
}: {
  value: string;
  label: string;
  children: React.ReactNode;
  /** Use when the item sits on a bg-slate-50 zone so hover is visible. */
  onDimBg?: boolean;
}) {
  return (
    <Accordion.Item value={value} className="border-b border-slate-100">
      <Accordion.Header>
        <Accordion.Trigger
          className={[
            'group w-full flex items-center justify-between px-4 py-2.5 transition-colors',
            onDimBg ? 'hover:bg-slate-100' : 'hover:bg-slate-50',
          ].join(' ')}
        >
          <SectionLabel className="font-bold text-slate-500 group-hover:text-slate-700 transition-colors">
            {label}
          </SectionLabel>
          <ChevronDown
            className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
            strokeWidth={2.5}
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="pb-1">
          {children}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left py-2 pr-4 pl-3.5 text-sm transition-colors border-l-[3px]',
        active
          ? 'border-l-blue-500 bg-blue-50 text-blue-700 font-semibold'
          : 'border-l-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Dataset grouping helpers ─────────────────────────────────────────────────

type GroupEntry =
  | { kind: 'single'; ds: DatasetDescriptor }
  | { kind: 'group'; key: string; items: DatasetDescriptor[] };

function buildGroupOrder(datasets: DatasetDescriptor[]): GroupEntry[] {
  const order: GroupEntry[] = [];
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
  return order;
}

function renderGroupEntry(
  entry: GroupEntry,
  selectedDatasetId: string | null,
  onDatasetChange: (id: string) => void,
) {
  if (entry.kind === 'single') {
    return (
      <li key={entry.ds.id} className="border-b border-slate-100 last:border-0">
        <NavItem active={selectedDatasetId === entry.ds.id} onClick={() => onDatasetChange(entry.ds.id)}>
          {entry.ds.label}
        </NavItem>
      </li>
    );
  }

  const { key, items } = entry;
  const isGroupActive = items.some(d => d.id === selectedDatasetId);
  const groupLabel = items.find(d => d.groupLabel)?.groupLabel ?? key;

  return (
    <li key={key} className="border-b border-slate-100 last:border-0">
      <NavItem
        active={isGroupActive}
        onClick={() => {
          const current = items.find(d => d.id === selectedDatasetId);
          onDatasetChange((current ?? items[0]).id);
        }}
      >
        {groupLabel}
      </NavItem>
      {isGroupActive && (
        <div className="flex gap-1 px-3.5 pb-2.5 pt-1">
          {items.map(ds => (
            <button
              key={ds.id}
              onClick={() => onDatasetChange(ds.id)}
              className={[
                'flex-1 text-xs py-1 rounded-md text-center transition-colors font-medium',
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
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

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
  extraDatasets,
  onOpenKoladaBrowse,
}: MapSidebarProps) {
  const availableDatasets = useMemo(() => {
    const base = getDatasetsForLevel(selectedLevel);
    const extra = (extraDatasets ?? []).filter(d => d.supportedLevels.includes(selectedLevel));
    return [...base, ...extra];
  }, [selectedLevel, extraDatasets]);

  const filterableDatasets = useMemo(
    () => DATASETS.filter(d => d.group !== 'val' && d.supportedLevels.includes(selectedLevel)),
    [selectedLevel],
  );

  const { byCategory, orderedCats } = useMemo(() => {
    const map = new Map<string, DatasetDescriptor[]>();
    for (const ds of availableDatasets) {
      const cat = ds.category ?? 'other';
      if (!map.has(cat)) { map.set(cat, []); }
      map.get(cat)!.push(ds);
    }
    const ordered: string[] = [];
    for (const cat of DATASET_CATEGORY_ORDER) {
      if (map.has(cat)) { ordered.push(cat); }
    }
    for (const cat of map.keys()) {
      if (!ordered.includes(cat)) { ordered.push(cat); }
    }
    return { byCategory: map, orderedCats: ordered };
  }, [availableDatasets]);

  const activeCategory = availableDatasets.find(d => d.id === selectedDatasetId)?.category;

  // Dataset accordion state — auto-opens the active category
  const [openDatasets, setOpenDatasets] = useState<string[]>(() =>
    activeCategory ? [activeCategory] : [],
  );
  useEffect(() => {
    if (!activeCategory) { return; }
    setOpenDatasets(prev => prev.includes(activeCategory) ? prev : [...prev, activeCategory]);
  }, [activeCategory]);

  // Settings accordion state (filter + basemap) — both start closed
  const [openSettings, setOpenSettings] = useState<string[]>([]);

  const showYearSlider =
    activeDescriptor &&
    activeDescriptor.availableYears.length > 1 &&
    !['RegSO', 'DeSO'].includes(selectedLevel);

  return (
    <aside className={[
      desktopOpen
        ? 'md:relative md:inset-auto md:z-auto md:translate-x-0 md:w-52 md:flex-shrink-0 md:border-r md:border-slate-200 md:bg-white md:flex md:flex-col md:[box-shadow:4px_0_12px_rgba(0,0,0,0.06)]'
        : 'md:hidden',
      'fixed top-11 bottom-0 left-0 z-30 w-1/2 border-r border-slate-200 bg-white flex flex-col',
      'transition-transform duration-300 ease-out shadow-xl',
      mobileOpen ? 'translate-x-0' : '-translate-x-full',
    ].join(' ')}>

      {/* Wordmark */}
      <div className="h-11 hidden md:flex items-center px-4 border-b border-slate-200 flex-shrink-0">
        <button
          onClick={onReset}
          className="flex items-center flex-1 hover:opacity-80 transition-opacity"
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

      {/* ── Zone 1: NIVÅ (fixed, always visible) ────────────────────────────── */}
      <div className="flex-shrink-0 bg-slate-50 border-b-2 border-slate-200">
        <div className="px-4 pt-3 pb-1">
          <SectionLabel className="font-bold">Nivå</SectionLabel>
        </div>
        <ul className="pb-1">
          {ADMIN_LEVELS.map(level => (
            <li key={level} className="border-b border-slate-100 last:border-0">
              <NavItem active={selectedLevel === level} onClick={() => onLevelChange(level)}>
                {LEVEL_LABELS[level]}
              </NavItem>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Zone 2: Datasets + ÅR (scrollable) ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <Accordion.Root
          type="multiple"
          value={openDatasets}
          onValueChange={setOpenDatasets}
        >
          {orderedCats.map(cat => {
            const label = DATASET_CATEGORY_LABELS[cat as DatasetCategory] ?? cat;
            const entries = buildGroupOrder(byCategory.get(cat)!);
            return (
              <SidebarItem key={cat} value={cat} label={label}>
                <ul>
                  {entries.map(entry => renderGroupEntry(entry, selectedDatasetId, onDatasetChange))}
                </ul>
              </SidebarItem>
            );
          })}
        </Accordion.Root>

        {showYearSlider && (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel className="font-bold text-slate-500">År</SectionLabel>
              <span className="text-sm font-semibold text-slate-700 tabular-nums">{displayYear}</span>
            </div>
            <YearSlider
              years={activeDescriptor!.availableYears.map(String)}
              selectedYear={String(displayYear)}
              onYearChange={y => onYearChange(Number(y))}
            />
          </div>
        )}

        {/* Browse Kolada catalog */}
        <div className="px-4 py-3">
          <button
            onClick={onOpenKoladaBrowse}
            className="w-full flex items-center gap-2 text-xs text-slate-400 hover:text-blue-600 transition-colors group"
          >
            <LibraryBig className="w-3.5 h-3.5 flex-shrink-0 group-hover:text-blue-500" />
            <span>Utforska Kolada-katalogen</span>
          </button>
        </div>
      </div>

      {/* ── Zone 3: Settings (fixed at bottom) ──────────────────────────────── */}
      <div className="flex-shrink-0 bg-slate-50 border-t-2 border-slate-200">
        <Accordion.Root
          type="multiple"
          value={openSettings}
          onValueChange={setOpenSettings}
        >
          <SidebarItem value="filter" label="Filter" onDimBg>
            <div className="px-4 pt-1 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Aktivera filter</span>
                <Switch.Root
                  checked={filterEnabled}
                  onCheckedChange={onFilterEnabledChange}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/30 data-[state=checked]:bg-blue-500 data-[state=unchecked]:bg-slate-300"
                >
                  <Switch.Thumb className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ease-in-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                </Switch.Root>
              </div>
              {filterEnabled && (
                <FilterPanel
                  criteria={filterCriteria}
                  onCriteriaChange={onFilterCriteriaChange}
                  sortedValues={filterSortedValues}
                  filterableDatasets={filterableDatasets}
                  matchingCount={filterMatchingCount}
                  loading={filterLoading}
                />
              )}
            </div>
          </SidebarItem>

          <SidebarItem value="basemap" label="Bakgrundskarta" onDimBg>
            <div className="px-4 pt-1 pb-3 flex flex-col gap-3">
              <Dropdown
                value={selectedBase}
                onChange={val => onBaseChange(val as BaseMapKey)}
                options={(['None', ...Object.keys(baseMaps)] as BaseMapKey[]).map(key => ({ value: key, label: baseMapLabels[key] }))}
              />
              {selectedBase !== 'None' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
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
          </SidebarItem>
        </Accordion.Root>
      </div>

    </aside>
  );
}
