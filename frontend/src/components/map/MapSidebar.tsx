import YearSlider from '@/components/common/YearSlider';
import { BaseMapKey, baseMaps, baseMapLabels } from '@/components/map/BaseMaps';
import { ADMIN_LEVELS, LEVEL_LABELS } from '@/datasets/adminLevels';
import { getDatasetsForLevel } from '@/datasets/registry';
import type { AdminLevel, DatasetDescriptor } from '@/datasets/types';

interface MapSidebarProps {
  selectedLevel:     AdminLevel;
  onLevelChange:     (level: AdminLevel) => void;
  selectedDatasetId: string | null;
  onDatasetChange:   (id: string) => void;
  activeDescriptor:  DatasetDescriptor | null;
  displayYear:       number;
  onYearChange:      (year: number) => void;
  selectedBase:      BaseMapKey;
  onBaseChange:      (base: BaseMapKey) => void;
  onReset:           () => void;
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
}: MapSidebarProps) {
  const availableDatasets = getDatasetsForLevel(selectedLevel);

  return (
    <aside className="w-52 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">

      {/* Wordmark */}
      <button
        onClick={onReset}
        className="h-11 flex items-center px-4 border-b border-slate-200 flex-shrink-0 w-full hover:bg-slate-100 transition-colors"
      >
        <span className="text-sm font-bold tracking-tight text-slate-800">Riks</span>
        <span className="text-sm font-bold tracking-tight text-blue-600">kartan</span>
      </button>

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
            <ul>
              {availableDatasets.map((ds) => (
                <li key={ds.id}>
                  <NavItem active={selectedDatasetId === ds.id} onClick={() => onDatasetChange(ds.id)}>
                    {ds.label}
                  </NavItem>
                </li>
              ))}
            </ul>
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
