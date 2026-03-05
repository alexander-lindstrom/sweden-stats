import { useEffect, useRef, useState } from 'react';
import { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS } from '@/datasets/adminLevels';
import { fetchCached } from '@/datasets/cache';
import { DATASETS } from '@/datasets/registry';
import { Spinner } from '@/components/ui/Spinner';

const LEVEL_BADGE: Record<AdminLevel, string> = {
  Country:      'bg-gray-100 text-slate-600',
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

function toStat(result: ScalarDatasetResult, code: string): StatData {
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
      <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-0.5">
        {label}
      </div>
      {stat.value === null ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {stat.value.toLocaleString('sv-SE')}
          </span>
          <span className="text-xs text-slate-500">{stat.unit}</span>
          {stat.rank !== null && stat.total !== null && (
            <span className="ml-auto text-xs text-slate-500 tabular-nums">
              #{stat.rank}
              <span className="text-slate-400">/{stat.total}</span>
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
        .then(r => { popStat = toStat(r as ScalarDatasetResult, code); })
        .catch(() => {}),
    ];

    if (wantsIncome) {
      statFetches.push(
        fetchCached(incomeDescriptor, adminLevel, STAT_YEAR)
          .then(r => { incomeStat = toStat(r as ScalarDatasetResult, code); })
          .catch(() => {}),
      );
    }

    if (wantsAge) {
      statFetches.push(
        fetchCached(ageDescriptor, adminLevel, STAT_YEAR)
          .then(r => { ageStat = toStat(r as ScalarDatasetResult, code); })
          .catch(() => {}),
      );
    }

    Promise.all(statFetches).then(() => {
      if (id !== fetchIdRef.current) { return; }
      if (popStat !== null) {
        setStats({
          population: popStat,
          income:     wantsIncome ? incomeStat : null,
          age:        wantsAge    ? ageStat    : null,
        });
      }
      setStatsLoading(false);
    });

    // -- Sparkline (population across years, parallel) ------------------------
    Promise.all(
      SPARKLINE_YEARS.map(year =>
        fetchCached(popDescriptor, adminLevel, year)
          .then(r => {
            const v = (r as ScalarDatasetResult).values[code];
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
    <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">

      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${LEVEL_BADGE[adminLevel]}`}>
            {LEVEL_LABELS[adminLevel]}
          </span>
          <h2 className="text-sm font-semibold text-slate-900 leading-snug">
            {selectedFeature?.label ?? <span className="text-slate-400 italic">Inget valt</span>}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Stäng panel"
          className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {!selectedFeature && (
          <p className="text-sm text-slate-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <>
            {/* Key stats ─────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Nyckeltal {STAT_YEAR}
              </h3>

              {statsLoading && <Spinner />}

              {!statsLoading && !stats && (
                <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
              )}

              {!statsLoading && stats && (
                <div className="space-y-3">
                  <StatRow label="Befolkning"    stat={stats.population} />
                  {stats.income && <StatRow label="Medianinkomst" stat={stats.income} />}
                  {stats.age    && <StatRow label="Medelålder"    stat={stats.age}    />}
                </div>
              )}
            </section>

            {/* Population sparkline — hidden for RegSO/DeSO (SCB only provides 2024 data at those levels) */}
            {adminLevel !== 'RegSO' && adminLevel !== 'DeSO' && <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Befolkningstrend
              </h3>

              {sparkLoading && <Spinner />}

              {!sparkLoading && sparkline.length >= 2 && (
                <>
                  <Sparkline data={sparkline} />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>{sparkline[0].year}</span>
                    <span>{sparkline[sparkline.length - 1].year}</span>
                  </div>
                </>
              )}

              {!sparkLoading && sparkline.length < 2 && (
                <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
              )}
            </section>}
          </>
        )}
      </div>
    </div>
  );
}
