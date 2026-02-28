import { useEffect, useRef, useState } from 'react';
import { AdminLevel, DatasetResult } from '@/datasets/types';
import { fetchCached } from '@/datasets/cache';
import { DATASETS } from '@/datasets/registry';

const LEVEL_LABELS: Record<AdminLevel, string> = {
  Country:      'Nationell',
  Region:       'Län',
  Municipality: 'Kommun',
  RegSO:        'RegSO',
  DeSO:         'DeSO',
};

const LEVEL_BADGE: Record<AdminLevel, string> = {
  Country:      'bg-gray-100 text-gray-600',
  Region:       'bg-blue-100 text-blue-700',
  Municipality: 'bg-teal-100 text-teal-700',
  RegSO:        'bg-orange-100 text-orange-700',
  DeSO:         'bg-rose-100 text-rose-700',
};

const popDescriptor    = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor    = DATASETS.find(d => d.id === 'medelalder')!;

const STAT_YEAR = 2024;

// Spread out across the population series (2000–2024) for a compact sparkline.
const SPARKLINE_YEARS = [2000, 2004, 2008, 2012, 2016, 2020, 2024];

// Levels that have income and age data.
const INCOME_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:    AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

interface StatData {
  value: number | null;
  unit:  string;
  rank:  number | null;
  total: number | null;
}

function toStat(result: DatasetResult, code: string): StatData {
  const value = result.values[code] ?? null;
  const all   = Object.values(result.values).filter(Number.isFinite) as number[];
  const rank  = value !== null ? all.filter(v => v > value).length + 1 : null;
  return { value, unit: result.unit, rank, total: all.length };
}

interface PanelStats {
  population: StatData;
  income:     StatData | null; // null → not supported at this level
  age:        StatData | null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, stat }: { label: string; stat: StatData }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-0.5">
        {label}
      </div>
      {stat.value === null ? (
        <div className="text-sm text-gray-400">—</div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-gray-900 tabular-nums">
            {stat.value.toLocaleString('sv-SE')}
          </span>
          <span className="text-xs text-gray-500">{stat.unit}</span>
          {stat.rank !== null && stat.total !== null && (
            <span className="ml-auto text-xs text-gray-500 tabular-nums">
              #{stat.rank}
              <span className="text-gray-400">/{stat.total}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data }: { data: Array<{ year: number; value: number }> }) {
  if (data.length < 2) { return null; }

  const W = 224, H = 52, pad = 3;
  const vals  = data.map(d => d.value);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = maxV - minV || 1;
  const innerH = H - pad * 2;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = pad + innerH - ((d.value - minV) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const trend = vals[vals.length - 1] > vals[0] ? 'up' : vals[vals.length - 1] < vals[0] ? 'down' : 'flat';
  const stroke = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#9ca3af';

  return (
    <svg width={W} height={H} className="block overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SelectionPanelProps {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
  isOpen: boolean;
  onClose: () => void;
}

export function SelectionPanel({ selectedFeature, adminLevel, isOpen, onClose }: SelectionPanelProps) {
  const [stats,        setStats]        = useState<PanelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sparkline,    setSparkline]    = useState<Array<{ year: number; value: number }>>([]);
  const [sparkLoading, setSparkLoading] = useState(false);
  const fetchIdRef                      = useRef(0);

  useEffect(() => {
    if (!selectedFeature) {
      setStats(null);
      setSparkline([]);
      return;
    }

    const id   = ++fetchIdRef.current;
    const code = selectedFeature.code;

    setStats(null);
    setStatsLoading(true);
    setSparkline([]);
    setSparkLoading(true);

    const wantsIncome = INCOME_LEVELS.includes(adminLevel);
    const wantsAge    = AGE_LEVELS.includes(adminLevel);

    // -- Stats (all three in parallel, resolved together) ---------------------
    let popStat:    StatData | null = null;
    let incomeStat: StatData | null = null;
    let ageStat:    StatData | null = null;

    const statFetches: Promise<void>[] = [
      fetchCached(popDescriptor, adminLevel, STAT_YEAR)
        .then(r => { popStat = toStat(r, code); })
        .catch(() => {}),
    ];

    if (wantsIncome) {
      statFetches.push(
        fetchCached(incomeDescriptor, adminLevel, STAT_YEAR)
          .then(r => { incomeStat = toStat(r, code); })
          .catch(() => {}),
      );
    }

    if (wantsAge) {
      statFetches.push(
        fetchCached(ageDescriptor, adminLevel, STAT_YEAR)
          .then(r => { ageStat = toStat(r, code); })
          .catch(() => {}),
      );
    }

    Promise.all(statFetches).then(() => {
      if (id !== fetchIdRef.current || popStat === null) { return; }
      setStats({
        population: popStat,
        income:     wantsIncome ? incomeStat : null,
        age:        wantsAge    ? ageStat    : null,
      });
      setStatsLoading(false);
    });

    // -- Sparkline (population across years, parallel) ------------------------
    Promise.all(
      SPARKLINE_YEARS.map(year =>
        fetchCached(popDescriptor, adminLevel, year)
          .then(r => {
            const v = r.values[code];
            return Number.isFinite(v) ? { year, value: v } : null;
          })
          .catch(() => null),
      ),
    ).then(results => {
      if (id !== fetchIdRef.current) { return; }
      setSparkline(results.filter((r): r is { year: number; value: number } => r !== null));
      setSparkLoading(false);
    });
  }, [selectedFeature, adminLevel]);

  if (!isOpen) { return null; }

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl flex flex-col z-20">

      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${LEVEL_BADGE[adminLevel]}`}>
            {LEVEL_LABELS[adminLevel]}
          </span>
          <h2 className="text-sm font-semibold text-gray-900 leading-snug">
            {selectedFeature?.label ?? <span className="text-gray-400 italic">Inget valt</span>}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Stäng panel"
          className="flex-shrink-0 mt-0.5 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {!selectedFeature && (
          <p className="text-sm text-gray-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <>
            {/* Key stats ─────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Nyckeltal {STAT_YEAR}
              </h3>

              {statsLoading && (
                <p className="text-sm text-gray-400 animate-pulse">Laddar…</p>
              )}

              {!statsLoading && !stats && (
                <p className="text-sm text-gray-400">Ingen data tillgänglig.</p>
              )}

              {!statsLoading && stats && (
                <div className="space-y-3">
                  <StatRow label="Befolkning"    stat={stats.population} />
                  {stats.income && <StatRow label="Medianinkomst" stat={stats.income} />}
                  {stats.age    && <StatRow label="Medelålder"    stat={stats.age}    />}
                </div>
              )}
            </section>

            {/* Population sparkline ───────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Befolkningstrend
              </h3>

              {sparkLoading && (
                <p className="text-sm text-gray-400 animate-pulse">Laddar…</p>
              )}

              {!sparkLoading && sparkline.length >= 2 && (
                <>
                  <Sparkline data={sparkline} />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{sparkline[0].year}</span>
                    <span>{sparkline[sparkline.length - 1].year}</span>
                  </div>
                </>
              )}

              {!sparkLoading && sparkline.length < 2 && (
                <p className="text-sm text-gray-400">Ingen data tillgänglig.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
