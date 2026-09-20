import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { PopulationPyramid } from '@/components/visualizations/PopulationPyramid';
import { ElectionDonut } from '@/components/visualizations/ElectionDonut';
import { ProfileSection } from './ProfileSection';
import { ProfileCard } from './ProfileCard';
import { RadarChart } from './RadarChart';
import { Sparkline } from './Sparkline';
import { Spinner } from '@/components/ui/Spinner';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { UI } from '@/theme';
import { useAreaStats, AREA_STATS_YEAR, toPanelStats, buildRadarAxes } from '@/hooks/useAreaStats';
import {
  usePopulationSparkline, useRiksdagsvalVotes, useAgePyramid,
  ELECTION_YEAR, ELECTION_LEVELS, SPARKLINE_LEVELS, PYRAMID_LEVELS,
} from '@/hooks/useAreaExtras';
import { formatNumber, formatSigned } from '@/utils/format';

const STAT_YEAR = AREA_STATS_YEAR;

const PEER_LABEL: Record<AdminLevel, string> = {
  Country:      'länder',
  Region:       'län',
  Municipality: 'kommuner',
  RegSO:        'RegSO-områden',
  DeSO:         'DeSO-områden',
};

// ── Area colour coding ────────────────────────────────────────────────────────
// The selected area is blue and the comparison area orange everywhere: header,
// stat rows, chart legends and card titles. Same convention as the selection
// panel, the radar and the sparkline.

type AreaRole = 'primary' | 'comparison';

const ROLE_DOT: Record<AreaRole, string> = {
  primary:    'bg-blue-500',
  comparison: 'bg-orange-500',
};

function AreaDot({ role, className = '' }: { role: AreaRole; className?: string }) {
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ROLE_DOT[role]} ${className}`} />;
}

/** Colour dot + name, so every card says which area it shows. */
function AreaTag({ role, children, className = '' }: { role: AreaRole; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
      <AreaDot role={role} />
      <div className="truncate min-w-0">{children}</div>
    </div>
  );
}

// ── Key stats ─────────────────────────────────────────────────────────────────

interface StatVal { value: number; mean: number | null; }

function toStatVal(result: ScalarDatasetResult | null, code: string): StatVal | null {
  if (!result) { return null; }
  const v = result.values[code];
  if (!Number.isFinite(v)) { return null; }
  const all  = Object.values(result.values).filter(Number.isFinite) as number[];
  const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
  return { value: v as number, mean };
}

function valueOf(result: ScalarDatasetResult | null, code: string): number | null {
  const v = result?.values[code];
  return Number.isFinite(v) ? (v as number) : null;
}

/** Single-area stat: the value against the mean of all peer areas. */
function StatMini({ label, value, mean, unit }: {
  label: string;
  value: number | null;
  mean:  number | null;
  unit:  string;
}) {
  const delta = value !== null && mean !== null ? value - mean : null;

  const fmtDelta = (d: number) => formatNumber(Math.abs(d));

  return (
    <div className={`${UI.card} min-w-0`}>
      <SectionLabel className="mb-1 block whitespace-normal leading-tight">{label}</SectionLabel>
      {value === null ? (
        <div className="text-sm text-slate-300">—</div>
      ) : (
        <>
          <div className={`${UI.statValue} truncate`}>{formatNumber(value)}</div>
          {unit && <div className={UI.statUnit}>{unit}</div>}
          {delta !== null && (
            <div className={`text-[11px] tabular-nums mt-1 leading-tight ${
              delta > 0 ? UI.deltaPositive : delta < 0 ? UI.deltaNegative : UI.deltaNeutral
            }`}>
              {delta > 0
                ? `↑ ${fmtDelta(delta)} över snitt`
                : delta < 0
                  ? `↓ ${fmtDelta(delta)} under snitt`
                  : '= snitt'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatValueRow({ role, value, loading = false }: { role: AreaRole; value: number | null; loading?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <AreaDot role={role} />
      <span className="text-base font-bold tabular-nums text-slate-900 truncate">
        {loading ? '…' : value === null ? '—' : formatNumber(value)}
      </span>
    </div>
  );
}

/**
 * Two-area stat: both values with their colour dots and the difference
 * (selected minus comparison). Replaces the peer-mean delta in compare mode;
 * the percentile radar below still covers "how does each rank".
 */
function StatCompareMini({ label, unit, a, b, bLoading }: {
  label:    string;
  unit:     string;
  a:        number | null;
  b:        number | null;
  bLoading: boolean;
}) {
  const delta      = a !== null && b !== null ? a - b : null;
  const deltaColor = delta === null || delta === 0
    ? UI.deltaNeutral
    : delta > 0 ? 'text-blue-600' : 'text-orange-600';

  return (
    <div className={`${UI.card} min-w-0`}>
      <SectionLabel className="mb-1.5 block whitespace-normal leading-tight">{label}</SectionLabel>
      <div className="space-y-1">
        <StatValueRow role="primary"    value={a} />
        <StatValueRow role="comparison" value={b} loading={bLoading} />
      </div>
      <div className={`text-[11px] tabular-nums mt-1.5 leading-tight ${deltaColor}`}>
        {delta === null
          ? (bLoading ? '…' : '—')
          : `Skillnad ${formatSigned(delta)} ${unit}`.trim()}
      </div>
    </div>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function SeriesLegend({ primary, comparison }: { primary: string; comparison: string }) {
  return (
    <div className="flex items-center gap-3 mt-2 justify-center">
      <span className="flex items-center gap-1 text-[11px] text-slate-500">
        <span className="w-2.5 h-0.5 rounded bg-blue-500 inline-block" />
        {primary}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-slate-500">
        <span className="w-2.5 h-0.5 rounded bg-orange-500 inline-block" />
        {comparison}
      </span>
    </div>
  );
}

function PyramidCard({ role, label, tagged, pyramid }: {
  role:    AreaRole;
  label:   string;
  /** Show the colour dot; only meaningful when two pyramids sit side by side. */
  tagged:  boolean;
  pyramid: { rows: Parameters<typeof PopulationPyramid>[0]['data']; loading: boolean };
}) {
  return (
    <ProfileCard title={tagged ? <AreaTag role={role}>{label}</AreaTag> : label} subtitle={`${STAT_YEAR}`}>
      {pyramid.loading
        ? <Spinner />
        : pyramid.rows.length > 0
          ? <PopulationPyramid data={pyramid.rows} />
          : <p className="text-sm text-slate-400">Ingen pyramiddata tillgänglig.</p>}
    </ProfileCard>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

interface Props {
  selectedFeature:    { code: string; label: string } | null;
  /** Second area (shift-click / Jämför). Every section then shows both areas. */
  comparisonFeature?: { code: string; label: string } | null;
  adminLevel:         AdminLevel;
}

/**
 * The deep dive for one area: key stats against the mean, percentile radar,
 * election result, population trend and age pyramid. The selection panel
 * next to the map keeps only the numbers.
 */
export function FeatureProfile({ selectedFeature, comparisonFeature = null, adminLevel }: Props) {
  const primary = useAreaStats(selectedFeature,   adminLevel, STAT_YEAR);
  const comp    = useAreaStats(comparisonFeature, adminLevel, STAT_YEAR);

  const spark       = usePopulationSparkline(selectedFeature,   adminLevel);
  const compSpark   = usePopulationSparkline(comparisonFeature, adminLevel);
  const votes       = useRiksdagsvalVotes(selectedFeature,   adminLevel);
  const compVotes   = useRiksdagsvalVotes(comparisonFeature, adminLevel);
  const pyramid     = useAgePyramid(selectedFeature,   adminLevel, STAT_YEAR);
  const compPyramid = useAgePyramid(comparisonFeature, adminLevel, STAT_YEAR);

  if (!selectedFeature) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
        {adminLevel === 'Country'
          ? 'Klicka på kartan för att se profil.'
          : 'Klicka på ett område på kartan, eller sök i panelen till höger.'}
      </div>
    );
  }

  const code        = selectedFeature.code;
  const isComparing = !!comparisonFeature;
  const compCode    = comparisonFeature?.code ?? '';

  const population   = toStatVal(primary.population, code);
  const income       = toStatVal(primary.income,     code);
  const age          = toStatVal(primary.age,        code);
  const employment   = toStatVal(primary.employment, code);
  const utlandsk     = toStatVal(primary.foreignBg,  code);

  const stats         = toPanelStats(primary, code);
  const compStats     = comparisonFeature ? toPanelStats(comp, compCode) : null;
  const radarAxes     = buildRadarAxes(stats);
  const compRadarAxes = buildRadarAxes(compStats);
  const showRadar     = !primary.loading && radarAxes.length >= 3;
  const showElection  = ELECTION_LEVELS.includes(adminLevel);

  const heading = (label: string) => (
    <h2 className="text-xl font-bold text-slate-900 truncate">{label}</h2>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      {/* Area heading */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${LEVEL_BADGE[adminLevel]}`}>
          {LEVEL_LABELS[adminLevel]}
        </span>
        {isComparing ? (
          <>
            <AreaTag role="primary">{heading(selectedFeature.label)}</AreaTag>
            <span className="text-slate-300 text-sm">vs</span>
            <AreaTag role="comparison">{heading(comparisonFeature!.label)}</AreaTag>
          </>
        ) : heading(selectedFeature.label)}
      </div>

      <ProfileSection title={`Nyckeltal ${STAT_YEAR}`}>
        {primary.loading ? (
          <Spinner />
        ) : isComparing ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatCompareMini label="Befolkning" unit={primary.population?.unit ?? ''} a={population?.value ?? null} b={valueOf(comp.population, compCode)} bLoading={comp.loading} />
            {income     && <StatCompareMini label="Medianinkomst"     unit={primary.income?.unit     ?? ''} a={income.value}     b={valueOf(comp.income,     compCode)} bLoading={comp.loading} />}
            {age        && <StatCompareMini label="Medelålder"        unit={primary.age?.unit        ?? ''} a={age.value}        b={valueOf(comp.age,        compCode)} bLoading={comp.loading} />}
            {employment && <StatCompareMini label="Sysselsättning"    unit={primary.employment?.unit ?? ''} a={employment.value} b={valueOf(comp.employment, compCode)} bLoading={comp.loading} />}
            {utlandsk   && <StatCompareMini label="Utländsk bakgrund" unit={primary.foreignBg?.unit  ?? ''} a={utlandsk.value}   b={valueOf(comp.foreignBg,  compCode)} bLoading={comp.loading} />}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatMini label="Befolkning"        value={population?.value ?? null} mean={population?.mean ?? null} unit={primary.population?.unit ?? ''} />
            {income     && <StatMini label="Medianinkomst"     value={income.value}     mean={income.mean}     unit={primary.income?.unit     ?? ''} />}
            {age        && <StatMini label="Medelålder"        value={age.value}        mean={age.mean}        unit={primary.age?.unit        ?? ''} />}
            {employment && <StatMini label="Sysselsättning"    value={employment.value} mean={employment.mean} unit={primary.employment?.unit ?? ''} />}
            {utlandsk   && <StatMini label="Utländsk bakgrund" value={utlandsk.value}   mean={utlandsk.mean}   unit={primary.foreignBg?.unit  ?? ''} />}
          </div>
        )}
      </ProfileSection>

      {(showRadar || showElection) && (
        <ProfileSection title="Profil">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {showRadar && (
              <ProfileCard title="Percentiler" subtitle={`Jämfört med alla ${PEER_LABEL[adminLevel]}, ${STAT_YEAR}`}>
                <RadarChart
                  axes={radarAxes}
                  comparisonAxes={isComparing && compRadarAxes.length === radarAxes.length ? compRadarAxes : undefined}
                />
                {isComparing && compRadarAxes.length > 0 && (
                  <SeriesLegend primary={selectedFeature.label} comparison={comparisonFeature!.label} />
                )}
              </ProfileCard>
            )}
            {showElection && (
              <ProfileCard title={`Riksdagsval ${ELECTION_YEAR}`} subtitle="Andel av rösterna">
                {(votes.loading || (isComparing && compVotes.loading)) && <Spinner />}
                {!votes.loading && !isComparing && (
                  votes.votes
                    ? <ElectionDonut votes={votes.votes} />
                    : <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
                )}
                {isComparing && !votes.loading && !compVotes.loading && (
                  <div className="space-y-3">
                    <div>
                      <AreaTag role="primary" className="text-[11px] font-semibold text-slate-700 mb-1">{selectedFeature.label}</AreaTag>
                      {votes.votes ? <ElectionDonut votes={votes.votes} /> : <p className="text-xs text-slate-400">Ingen data</p>}
                    </div>
                    <div>
                      <AreaTag role="comparison" className="text-[11px] font-semibold text-slate-700 mb-1">{comparisonFeature!.label}</AreaTag>
                      {compVotes.votes ? <ElectionDonut votes={compVotes.votes} /> : <p className="text-xs text-slate-400">Ingen data</p>}
                    </div>
                  </div>
                )}
              </ProfileCard>
            )}
          </div>
        </ProfileSection>
      )}

      {SPARKLINE_LEVELS.includes(adminLevel) && (
        <ProfileSection title="Befolkningstrend">
          <ProfileCard title="Folkmängd" subtitle="Vart fjärde år sedan 2000">
            {(spark.loading || (isComparing && compSpark.loading)) && <Spinner />}
            {!spark.loading && spark.points.length >= 2 && (
              <>
                <Sparkline
                  data={spark.points}
                  comparisonData={isComparing && !compSpark.loading && compSpark.points.length >= 2 ? compSpark.points : undefined}
                  width={640}
                  height={120}
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{spark.points[0].year}</span>
                  <span>{spark.points[spark.points.length - 1].year}</span>
                </div>
                {isComparing && compSpark.points.length >= 2 && (
                  <SeriesLegend primary={selectedFeature.label} comparison={comparisonFeature!.label} />
                )}
              </>
            )}
            {!spark.loading && spark.points.length < 2 && (
              <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
            )}
          </ProfileCard>
        </ProfileSection>
      )}

      {PYRAMID_LEVELS.includes(adminLevel) && (
        <ProfileSection title="Ålderspyramid">
          <div className={isComparing ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : undefined}>
            <PyramidCard role="primary" label={selectedFeature.label} tagged={isComparing} pyramid={pyramid} />
            {isComparing && (
              <PyramidCard role="comparison" label={comparisonFeature!.label} tagged pyramid={compPyramid} />
            )}
          </div>
        </ProfileSection>
      )}
    </div>
  );
}
