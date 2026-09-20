import { useState } from 'react';
import { GitCompareArrows, LayoutDashboard } from 'lucide-react';
import { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { Spinner } from '@/components/ui/Spinner';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { FeatureSearch, FeatureSearchItem } from '@/components/ui/FeatureSearch';
import { ProfileSection } from '@/components/profile/ProfileSection';
import { useAreaStats, AREA_STATS_YEAR, toStat, toPanelStats, type StatData } from '@/hooks/useAreaStats';
import { formatNumber, formatSigned } from '@/utils/format';

const STAT_YEAR = AREA_STATS_YEAR;

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Thin horizontal bar showing where a value sits relative to all peers.
 * The vertical tick marks the median (50th percentile).
 * Hover to see the rank and exact percentile.
 */
function PercentileBar({ percentile, rank, total }: { percentile: number; rank?: number | null; total?: number | null }) {
  const [showTip, setShowTip] = useState(false);
  const pct = Math.max(0, Math.min(1, percentile)) * 100;
  return (
    <div
      className="py-2 relative cursor-default select-none"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div className="relative h-1.5 rounded-full bg-slate-100">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-200"
          style={{ width: `${pct}%` }}
        />
        {/* Median tick */}
        <div className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: '50%' }} />
        {/* Position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-white shadow-sm"
          style={{ left: `${pct}%` }}
        />
      </div>
      {showTip && rank != null && total != null && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 px-2 py-1 bg-gray-900 text-white text-[11px] rounded whitespace-nowrap pointer-events-none z-10 shadow-md">
          #{rank} av {total}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, stat, accent = false }: { label: string; stat: StatData; accent?: boolean }) {
  return (
    <div className={accent ? 'rounded-lg bg-blue-50/70 border border-blue-100 px-2.5 py-2' : undefined}>
      <SectionLabel className={`mb-0.5 block ${accent ? 'text-blue-600' : ''}`}>{label}</SectionLabel>
      {stat.value === null ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatNumber(stat.value)}
            </span>
            <span className="text-xs text-slate-500 font-medium">{stat.unit}</span>
          </div>
          {stat.percentile !== null && (
            <PercentileBar percentile={stat.percentile} rank={stat.rank} total={stat.total} />
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Scalar result for the dataset currently being explored, shown as the first stat row. */
export interface ActiveStatSource {
  datasetId: string;
  label:     string;
  year:      number;
  result:    ScalarDatasetResult;
}

interface StatRowDef {
  key:     string;
  label:   string;
  a:       StatData;
  b:       StatData | null;
  accent?: boolean;
}

export interface SelectionPanelProps {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
  isOpen: boolean;
  onClose: () => void;
  /** Second area selected for comparison (shift-click). */
  comparisonFeature?: { code: string; label: string } | null;
  onClearComparison?: () => void;
  /** Items for the area search box. When provided, a search field is shown. */
  searchItems?:              FeatureSearchItem[];
  onSearchSelect?:           (f: FeatureSearchItem) => void;
  onSearchComparisonSelect?: (f: FeatureSearchItem) => void;
  /** The dataset currently shown on the map/chart. Rendered as the first key stat. */
  activeStat?:               ActiveStatSource | null;
  /** "Jämför" pressed: the next click picks the comparison area. */
  comparePickMode?:          boolean;
  onCompareRequest?:         () => void;
  onCancelCompare?:          () => void;
  /** Switches to the profile view (charts, pyramid). Omit when unavailable. */
  onOpenProfile?:            () => void;
}

/**
 * Compact companion to the map: the numbers for the selected area (active
 * dataset first, then the fixed demographics) and comparison. Charts live in
 * the profile view.
 */
export function SelectionPanel({ selectedFeature, adminLevel, isOpen, onClose, comparisonFeature, onClearComparison, searchItems, onSearchSelect, onSearchComparisonSelect, activeStat, comparePickMode = false, onCompareRequest, onCancelCompare, onOpenProfile }: SelectionPanelProps) {
  // ── Stats (via shared hook) ───────────────────────────────────────────────
  const primaryAreaStats = useAreaStats(selectedFeature,         adminLevel, STAT_YEAR);
  const compAreaStats    = useAreaStats(comparisonFeature ?? null, adminLevel, STAT_YEAR);

  const stats     = selectedFeature   ? toPanelStats(primaryAreaStats, selectedFeature.code)   : null;
  const compStats = comparisonFeature ? toPanelStats(compAreaStats,    comparisonFeature.code)  : null;

  // ── Stat rows: active dataset first, then the fixed five ──────────────────
  // The active dataset is already fetched, so it renders before the fixed stats
  // arrive. A fixed row is dropped when it duplicates the active dataset.
  const activeStatData     = activeStat && selectedFeature   ? toStat(activeStat.result, selectedFeature.code)   : null;
  const compActiveStatData = activeStat && comparisonFeature ? toStat(activeStat.result, comparisonFeature.code) : null;

  const statRows: StatRowDef[] = [];
  if (activeStat && activeStatData) {
    statRows.push({
      key:    'active',
      label:  activeStat.year !== STAT_YEAR ? `${activeStat.label} · ${activeStat.year}` : activeStat.label,
      a:      activeStatData,
      b:      compActiveStatData,
      accent: true,
    });
  }
  if (stats) {
    const fixed: Array<{ id: string; label: string; a: StatData | null; b: StatData | null | undefined }> = [
      { id: 'population',        label: 'Befolkning',        a: stats.population, b: compStats?.population },
      { id: 'medianinkomst',     label: 'Medianinkomst',     a: stats.income,     b: compStats?.income     },
      { id: 'medelalder',        label: 'Medelålder',        a: stats.age,        b: compStats?.age        },
      { id: 'utlandsk_bakgrund', label: 'Utländsk bakgrund', a: stats.foreignBg,  b: compStats?.foreignBg  },
      { id: 'sysselsattning',    label: 'Sysselsättning',    a: stats.employment, b: compStats?.employment },
    ];
    for (const r of fixed) {
      if (!r.a || r.id === activeStat?.datasetId) { continue; }
      statRows.push({ key: r.id, label: r.label, a: r.a, b: r.b ?? null });
    }
  }

  const isComparing = !!comparisonFeature;

  return (
    <div
      aria-hidden={!isOpen}
      className={[
        'flex flex-col bg-white',
        'transition-[transform,width] duration-300 ease-out',
        // Mobile (<sm): fixed bottom sheet
        'fixed bottom-0 left-0 right-0 z-30',
        'max-h-[50vh] rounded-t-2xl shadow-2xl border-t border-slate-200',
        // sm–lg: absolute right-side overlay drawer within the positioned map container
        'sm:absolute sm:left-auto sm:right-0 sm:top-0 sm:bottom-auto',
        'sm:h-full sm:max-h-none sm:z-20',
        'sm:rounded-none sm:shadow-xl sm:border-t-0 sm:border-l sm:border-slate-200',
        // lg+: in-flow push sidebar
        'lg:static lg:h-auto lg:inset-auto lg:z-auto',
        'lg:[box-shadow:-4px_0_12px_rgba(0,0,0,0.06)]',
        isComparing ? 'sm:w-[400px] lg:w-[440px]' : 'sm:w-80 lg:w-72',
        'sm:flex-shrink-0',
        // Open / closed
        isOpen
          ? 'translate-y-0 sm:translate-x-0'
          : 'translate-y-full sm:translate-y-0 sm:translate-x-full lg:translate-x-0 lg:hidden',
      ].join(' ')}
    >
      {/* Drag handle — mobile only */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
        <div className="w-8 h-1 rounded-full bg-slate-300" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${LEVEL_BADGE[adminLevel]}`}>
          {LEVEL_LABELS[adminLevel]}
        </span>
        {isComparing ? (
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">{selectedFeature?.label}</span>
            </span>
            <span className="text-slate-300 text-[11px] font-medium">vs</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">{comparisonFeature?.label}</span>
            </span>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-snug truncate">
              {selectedFeature?.label ?? <span className="text-slate-400 font-normal italic">Inget valt</span>}
            </h2>
          </div>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedFeature && !isComparing && onCompareRequest && (
            <button
              onClick={comparePickMode ? onCancelCompare : onCompareRequest}
              aria-pressed={comparePickMode}
              title="Jämför med ett annat område"
              className={[
                'flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded transition-colors',
                comparePickMode
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-slate-500 hover:text-orange-600 hover:bg-orange-50',
              ].join(' ')}
            >
              <GitCompareArrows className="w-3.5 h-3.5" strokeWidth={2} />
              Jämför
            </button>
          )}
          {isComparing && (
            <button
              onClick={onClearComparison}
              aria-label="Rensa jämförelse"
              title="Rensa jämförelse"
              className="text-orange-400 hover:text-orange-600 transition-colors text-xs font-semibold px-1.5 py-0.5 rounded hover:bg-orange-50"
            >
              Rensa
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Stäng panel"
            className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100"
          >
            ×
          </button>
        </div>
      </div>

      {/* Comparison pick banner */}
      {comparePickMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100 text-xs text-orange-700 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="flex-1">Klicka på ett annat område, eller sök nedan, för att jämföra.</span>
          <button onClick={onCancelCompare} className="font-semibold hover:underline">Avbryt</button>
        </div>
      )}

      {/* Search */}
      {searchItems && searchItems.length > 0 && onSearchSelect && (
        <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
          <FeatureSearch
            items={searchItems}
            onSelect={onSearchSelect}
            onComparisonSelect={onSearchComparisonSelect}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">

        {!selectedFeature && (
          <p className="text-sm text-slate-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <>
            {/* Key stats */}
            <ProfileSection title={`Nyckeltal ${STAT_YEAR}`}>
              {statRows.length > 0 && !isComparing && (
                <div className="space-y-3">
                  {statRows.map(r => <StatRow key={r.key} label={r.label} stat={r.a} accent={r.accent} />)}
                </div>
              )}
              {statRows.length > 0 && isComparing && (
                <ComparisonStatsTable rows={statRows} compLoading={compAreaStats.loading} />
              )}
              {(primaryAreaStats.loading || (isComparing && compAreaStats.loading)) && <Spinner />}
              {!primaryAreaStats.loading && statRows.length === 0 && (
                <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
              )}
            </ProfileSection>

            {/* Deep dive lives in the profile view */}
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg py-2 border border-slate-200 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" strokeWidth={2} />
                Visa profil{isComparing ? ' och jämförelse' : ''}
              </button>
            )}

            {/* Comparison hint — shown only when a single area is selected */}
            {!isComparing && !comparePickMode && (
              <p className="text-[11px] text-slate-400 text-center hidden sm:block">
                Skift-klicka ett annat område, eller tryck Jämför, för att jämföra
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Comparison stats table ─────────────────────────────────────────────────────

interface ComparisonStatsTableProps {
  rows:        StatRowDef[];
  compLoading: boolean;
}

function ComparisonStatsTable({ rows, compLoading }: ComparisonStatsTableProps) {
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <ComparisonStatRow key={r.key} label={r.label} a={r.a} b={r.b} compLoading={compLoading} accent={r.accent} />
      ))}
    </div>
  );
}

function ComparisonStatRow({
  label, a, b, compLoading, accent = false,
}: {
  label: string;
  a: StatData;
  b: StatData | null;
  compLoading: boolean;
  accent?: boolean;
}) {
  const delta = a.value !== null && b?.value !== null && b?.value !== undefined
    ? a.value - b.value
    : null;

  const fmtVal = (v: number | null, unit: string) =>
    v !== null ? `${formatNumber(v)} ${unit}`.trim() : '—';

  const fmtDelta = (d: number | null, unit: string) => {
    if (d === null) { return null; }
    return `${formatSigned(d)} ${unit}`.trim();
  };

  const deltaStr = fmtDelta(delta, a.unit);
  const deltaColor = delta === null ? '' : delta > 0 ? 'text-blue-600' : delta < 0 ? 'text-orange-600' : 'text-slate-400';

  return (
    <div className={accent ? 'rounded-lg bg-blue-50/70 border border-blue-100 px-2.5 py-2' : undefined}>
      <SectionLabel className={`mb-1 block ${accent ? 'text-blue-600' : ''}`}>{label}</SectionLabel>
      {/* sm: 2-column (A | B); lg: 3-column (A | delta | B) */}
      <div className="grid grid-cols-2 lg:grid-cols-[1fr_auto_1fr] gap-x-2 items-start lg:items-baseline">
        {/* Area A */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 self-center" />
            <span className="text-base font-bold text-slate-900 tabular-nums truncate">
              {a.value !== null ? formatNumber(a.value) : '—'}
            </span>
            <span className="text-[11px] text-slate-500 flex-shrink-0">{a.unit}</span>
          </div>
          {a.rank !== null && a.total !== null && (
            <div className="text-[11px] text-slate-400 tabular-nums pl-2.5">#{a.rank}/{a.total}</div>
          )}
        </div>

        {/* Delta — center column at lg+, hidden in grid at sm */}
        <div className={`hidden lg:block text-xs font-bold tabular-nums text-center ${deltaColor}`}>
          {deltaStr ?? (compLoading ? '…' : '—')}
        </div>

        {/* Area B */}
        <div className="min-w-0 text-right">
          {compLoading ? (
            <span className="text-xs text-slate-300">…</span>
          ) : b ? (
            <>
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-base font-bold text-slate-900 tabular-nums truncate">
                  {b.value !== null ? formatNumber(b.value) : '—'}
                </span>
                <span className="text-[11px] text-slate-500 flex-shrink-0">{b.unit}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 self-center" />
              </div>
              {b.rank !== null && b.total !== null && (
                <div className="text-[11px] text-slate-400 tabular-nums pr-2.5">#{b.rank}/{b.total}</div>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">{fmtVal(null, '')}</span>
          )}
        </div>
      </div>

      {/* Delta — shown below values at sm-lg, hidden at lg+ */}
      {(deltaStr || compLoading) && (
        <div className={`lg:hidden text-xs font-bold tabular-nums text-center mt-0.5 ${deltaColor}`}>
          {deltaStr ?? (compLoading ? '…' : '—')}
        </div>
      )}
    </div>
  );
}
