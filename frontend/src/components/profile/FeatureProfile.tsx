import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { fetchAgeGenderBreakdown, type PyramidRow } from '@/datasets/scb/population';
import { PopulationPyramid } from '@/components/visualizations/PopulationPyramid';
import { ProfileSection } from './ProfileSection';
import { ProfileCard } from './ProfileCard';
import { Spinner } from '@/components/ui/Spinner';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { UI } from '@/theme';
import { useAreaStats, AREA_STATS_YEAR } from '@/hooks/useAreaStats';

const STAT_YEAR     = AREA_STATS_YEAR;
const PYRAMID_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

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

  const fmtDelta = (d: number) =>
    Math.abs(d) < 100
      ? Math.abs(d).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : Math.round(Math.abs(d)).toLocaleString('sv-SE');

  return (
    <div className={`${UI.card} min-w-0`}>
      <SectionLabel className="mb-1 block truncate">{label}</SectionLabel>
      {value === null ? (
        <div className="text-sm text-slate-300">—</div>
      ) : (
        <>
          <div className={`${UI.statValue} truncate`}>{value.toLocaleString('sv-SE')}</div>
          {unit && <div className={UI.statUnit}>{unit}</div>}
          {delta !== null && (
            <div className={`text-[10px] tabular-nums mt-1 leading-tight ${
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

interface Props {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
}

export function FeatureProfile({ selectedFeature, adminLevel }: Props) {
  const {
    population: popResult,
    income:     incomeResult,
    age:        ageResult,
    foreignBg:  utlandskResult,
    employment: employResult,
    loading:    statsLoading,
  } = useAreaStats(selectedFeature, adminLevel, STAT_YEAR);

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
          : 'Sök efter ett område ovan eller klicka på kartan.'}
      </div>
    );
  }

  const code        = selectedFeature.code;
  const population  = toStatVal(popResult, code);
  const popUnit     = popResult?.unit    ?? '';
  const income      = toStatVal(incomeResult, code);
  const incomeUnit  = incomeResult?.unit ?? '';
  const age         = toStatVal(ageResult, code);
  const ageUnit     = ageResult?.unit    ?? '';
  const employment  = toStatVal(employResult, code);
  const employUnit  = employResult?.unit ?? '';
  const utlandsk    = toStatVal(utlandskResult, code);
  const utlandskUnit = utlandskResult?.unit ?? '';

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      {/* Area heading */}
      <div className="flex items-center gap-3">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${LEVEL_BADGE[adminLevel]}`}>
          {LEVEL_LABELS[adminLevel]}
        </span>
        <h2 className="text-xl font-bold text-slate-900 truncate">{selectedFeature.label}</h2>
      </div>

      <ProfileSection title="Demografi">
        {statsLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            <StatMini label="Befolkning"      value={population?.value ?? null} mean={population?.mean ?? null} unit={popUnit}     />
            {income    && <StatMini label="Medianinkomst"   value={income.value}    mean={income.mean}    unit={incomeUnit}  />}
            {age       && <StatMini label="Medelålder"      value={age.value}       mean={age.mean}       unit={ageUnit}     />}
            {employment && <StatMini label="Sysselsättning" value={employment.value} mean={employment.mean} unit={employUnit} />}
            {utlandsk  && <StatMini label="Utländsk bakgrund" value={utlandsk.value} mean={utlandsk.mean}  unit={utlandskUnit} />}
          </div>
        )}
        {PYRAMID_LEVELS.includes(adminLevel) && (
          pyramidLoading ? <Spinner /> :
          pyramid.length > 0
            ? (
              <ProfileCard title="Ålderspyramid" subtitle={`${STAT_YEAR}`}>
                <PopulationPyramid data={pyramid} />
              </ProfileCard>
            )
            : !pyramidLoading && (
              <p className="text-sm text-slate-400">Ingen pyramiddata tillgänglig.</p>
            )
        )}
      </ProfileSection>
    </div>
  );
}
