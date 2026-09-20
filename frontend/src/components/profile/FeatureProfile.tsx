import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { fetchAgeGenderBreakdown, type PyramidRow } from '@/datasets/scb/population';
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
  usePopulationSparkline, useRiksdagsvalVotes,
  ELECTION_YEAR, ELECTION_LEVELS, SPARKLINE_LEVELS,
} from '@/hooks/useAreaExtras';
import { formatNumber } from '@/utils/format';

const STAT_YEAR      = AREA_STATS_YEAR;
const PYRAMID_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

const PEER_LABEL: Record<AdminLevel, string> = {
  Country:      'länder',
  Region:       'län',
  Municipality: 'kommuner',
  RegSO:        'RegSO-områden',
  DeSO:         'DeSO-områden',
};

interface StatVal { value: number; mean: number | null; }

function toStatVal(result: ScalarDatasetResult | null, code: string): StatVal | null {
  if (!result) { return null; }
  const v = result.values[code];
  if (!Number.isFinite(v)) { return null; }
  const all  = Object.values(result.values).filter(Number.isFinite) as number[];
  const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
  return { value: v as number, mean };
}

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

interface Props {
  selectedFeature:    { code: string; label: string } | null;
  /** Second area (shift-click / Jämför). Overlaid on the radar, trend and election charts. */
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

  const spark     = usePopulationSparkline(selectedFeature,   adminLevel);
  const compSpark = usePopulationSparkline(comparisonFeature, adminLevel);
  const votes     = useRiksdagsvalVotes(selectedFeature,   adminLevel);
  const compVotes = useRiksdagsvalVotes(comparisonFeature, adminLevel);

  const [pyramid,        setPyramid]        = useState<PyramidRow[]>([]);
  const [pyramidLoading, setPyramidLoading] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!selectedFeature || !PYRAMID_LEVELS.includes(adminLevel)) {
      setPyramid([]);
      return;
    }

    const id   = ++fetchIdRef.current;
    const code = selectedFeature.code;

    setPyramid([]);
    setPyramidLoading(true);

    fetchAgeGenderBreakdown(adminLevel, code, STAT_YEAR)
      .then(rows => {
        if (id !== fetchIdRef.current) { return; }
        setPyramid(rows);
        setPyramidLoading(false);
      })
      .catch(() => { if (id === fetchIdRef.current) { setPyramidLoading(false); } });
  }, [selectedFeature, adminLevel]);

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

  const population   = toStatVal(primary.population, code);
  const income       = toStatVal(primary.income,     code);
  const age          = toStatVal(primary.age,        code);
  const employment   = toStatVal(primary.employment, code);
  const utlandsk     = toStatVal(primary.foreignBg,  code);

  const stats         = toPanelStats(primary, code);
  const compStats     = comparisonFeature ? toPanelStats(comp, comparisonFeature.code) : null;
  const radarAxes     = buildRadarAxes(stats);
  const compRadarAxes = buildRadarAxes(compStats);
  const showRadar     = !primary.loading && radarAxes.length >= 3;
  const showElection  = ELECTION_LEVELS.includes(adminLevel);

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      {/* Area heading */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${LEVEL_BADGE[adminLevel]}`}>
          {LEVEL_LABELS[adminLevel]}
        </span>
        <h2 className="text-xl font-bold text-slate-900 truncate">{selectedFeature.label}</h2>
        {isComparing && (
          <>
            <span className="text-slate-300 text-sm">vs</span>
            <h2 className="text-xl font-bold text-orange-600 truncate">{comparisonFeature!.label}</h2>
          </>
        )}
      </div>

      <ProfileSection title={`Nyckeltal ${STAT_YEAR}`}>
        {primary.loading ? (
          <Spinner />
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
                      <div className="text-[11px] font-semibold text-blue-600 mb-1 truncate">{selectedFeature.label}</div>
                      {votes.votes ? <ElectionDonut votes={votes.votes} /> : <p className="text-xs text-slate-400">Ingen data</p>}
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-orange-600 mb-1 truncate">{comparisonFeature!.label}</div>
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
          {pyramidLoading ? <Spinner /> :
            pyramid.length > 0
              ? (
                <ProfileCard title={selectedFeature.label} subtitle={`${STAT_YEAR}`}>
                  <PopulationPyramid data={pyramid} />
                </ProfileCard>
              )
              : <p className="text-sm text-slate-400">Ingen pyramiddata tillgänglig.</p>
          }
        </ProfileSection>
      )}
    </div>
  );
}
