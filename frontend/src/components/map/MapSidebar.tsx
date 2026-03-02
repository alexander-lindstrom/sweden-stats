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
}: MapSidebarProps) {
  const availableDatasets = getDatasetsForLevel(selectedLevel);

  return (
    <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col p-4 gap-6 overflow-y-auto">
      {/* Admin level */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Nivå
        </h2>
        <ul className="flex flex-col gap-1">
          {ADMIN_LEVELS.map((level) => (
            <li key={level}>
              <button
                onClick={() => onLevelChange(level)}
                className={[
                  'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                  selectedLevel === level
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-100',
                ].join(' ')}
              >
                {LEVEL_LABELS[level]}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Dataset list */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Dataset
        </h2>
        {availableDatasets.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            Inga dataset för denna nivå.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {availableDatasets.map((ds) => (
              <li key={ds.id}>
                <button
                  onClick={() => onDatasetChange(ds.id)}
                  className={[
                    'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                    selectedDatasetId === ds.id
                      ? 'bg-blue-100 text-blue-800 font-medium'
                      : 'text-gray-700 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {ds.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Year slider — hidden at RegSO/DeSO (boundary-locked) and for datasets with no year dimension */}
      {activeDescriptor && activeDescriptor.availableYears.length > 1 && !['RegSO', 'DeSO'].includes(selectedLevel) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            År: {displayYear}
          </h2>
          <YearSlider
            years={activeDescriptor.availableYears.map(String)}
            selectedYear={String(displayYear)}
            onYearChange={(y) => onYearChange(Number(y))}
          />
        </section>
      )}

      {/* Base map */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Bakgrundskarta
        </h2>
        <select
          value={selectedBase}
          onChange={(e) => onBaseChange(e.target.value as BaseMapKey)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700"
        >
          {(['None', ...Object.keys(baseMaps)] as BaseMapKey[]).map((key) => (
            <option key={key} value={key}>
              {baseMapLabels[key]}
            </option>
          ))}
        </select>
      </section>
    </aside>
  );
}
