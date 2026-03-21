import { useEffect, useRef, useState } from 'react';
import type { AdminLevel } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { DATASETS } from '@/datasets/registry';
import { fetchCached } from '@/datasets/cache';
import { fetchAgeGenderBreakdown, type PyramidRow } from '@/datasets/scb/population';
import { PopulationPyramid } from '@/components/visualizations/PopulationPyramid';
import { ProfileSection } from './ProfileSection';
import { ProfileCard } from './ProfileCard';
import { Spinner } from '@/components/ui/Spinner';
import { UI } from '@/theme';

const popDescriptor         = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor      = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor         = DATASETS.find(d => d.id === 'medelalder')!;
const employmentDescriptor  = DATASETS.find(d => d.id === 'sysselsattning')!;
const utlandskDescriptor    = DATASETS.find(d => d.id === 'utlandsk_bakgrund')!;

const STAT_YEAR     = 2024;
const PYRAMID_LEVELS:    AdminLevel[] = ['RegSO', 'DeSO'];
const INCOME_LEVELS:     AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:        AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const EMPLOYMENT_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const UTLANDSK_LEVELS:   AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

interface StatVal { value: number; mean: number | null; }

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
    <div className={UI.card}>
      <div className={`${UI.statLabel} mb-1`}>{label}</div>
      {value === null ? (
        <div className="text-sm text-slate-300">—</div>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span className={UI.statValue}>{value.toLocaleString('sv-SE')}</span>
            {unit && <span className={UI.statUnit}>{unit}</span>}
          </div>
          {delta !== null && (
            <div className={`text-[10px] tabular-nums mt-1 ${
              delta > 0 ? UI.deltaPositive : delta < 0 ? UI.deltaNegative : UI.deltaNeutral
            }`}>
              {delta > 0
                ? `↑ ${fmtDelta(delta)} ${unit} över snitt`
                : delta < 0
                  ? `↓ ${fmtDelta(delta)} ${unit} under snitt`
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
  const [population,   setPopulation]   = useState<StatVal | null>(null);
  const [popUnit,      setPopUnit]      = useState('');
  const [income,       setIncome]       = useState<StatVal | null>(null);
  const [incomeUnit,   setIncomeUnit]   = useState('');
  const [age,          setAge]          = useState<StatVal | null>(null);
  const [ageUnit,      setAgeUnit]      = useState('');
  const [employment,   setEmployment]   = useState<StatVal | null>(null);
  const [employUnit,   setEmployUnit]   = useState('');
  const [utlandsk,     setUtlandsk]     = useState<StatVal | null>(null);
  const [utlandskUnit, setUtlandskUnit] = useState('');
  const [statsLoading, setStatsLoading] = useState(false);

  const [pyramid,        setPyramid]        = useState<PyramidRow[]>([]);
  const [pyramidLoading, setPyramidLoading] = useState(false);

  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!selectedFeature) {
      setPopulation(null);
      setIncome(null);
      setAge(null);
      setEmployment(null);
      setUtlandsk(null);
      setPyramid([]);
      return;
    }

    const id   = ++fetchIdRef.current;
    const code = selectedFeature.code;

    setPopulation(null);
    setIncome(null);
    setAge(null);
    setEmployment(null);
    setUtlandsk(null);
    setStatsLoading(true);
    setPyramid([]);

    const wantsIncome     = INCOME_LEVELS.includes(adminLevel);
    const wantsAge        = AGE_LEVELS.includes(adminLevel);
    const wantsEmployment = EMPLOYMENT_LEVELS.includes(adminLevel);

    const statFetches: Promise<void>[] = [
      fetchCached(popDescriptor, adminLevel, STAT_YEAR)
        .then(r => {
          if (r.kind !== 'scalar') { return; }
          setPopUnit(r.unit);
          const all  = Object.values(r.values).filter(Number.isFinite) as number[];
          const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
          const v    = r.values[code];
          setPopulation(Number.isFinite(v) ? { value: v, mean } : null);
        })
        .catch(() => {}),
    ];

    if (wantsIncome) {
      statFetches.push(
        fetchCached(incomeDescriptor, adminLevel, STAT_YEAR)
          .then(r => {
            if (r.kind !== 'scalar') { return; }
            setIncomeUnit(r.unit);
            const all  = Object.values(r.values).filter(Number.isFinite) as number[];
            const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
            const v    = r.values[code];
            setIncome(Number.isFinite(v) ? { value: v, mean } : null);
          })
          .catch(() => {}),
      );
    }

    if (wantsAge) {
      statFetches.push(
        fetchCached(ageDescriptor, adminLevel, STAT_YEAR)
          .then(r => {
            if (r.kind !== 'scalar') { return; }
            setAgeUnit(r.unit);
            const all  = Object.values(r.values).filter(Number.isFinite) as number[];
            const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
            const v    = r.values[code];
            setAge(Number.isFinite(v) ? { value: v, mean } : null);
          })
          .catch(() => {}),
      );
    }

    if (wantsEmployment) {
      statFetches.push(
        fetchCached(employmentDescriptor, adminLevel, STAT_YEAR)
          .then(r => {
            if (r.kind !== 'scalar') { return; }
            setEmployUnit(r.unit);
            const all  = Object.values(r.values).filter(Number.isFinite) as number[];
            const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
            const v    = r.values[code];
            setEmployment(Number.isFinite(v) ? { value: v, mean } : null);
          })
          .catch(() => {}),
      );
    }

    if (UTLANDSK_LEVELS.includes(adminLevel)) {
      statFetches.push(
        fetchCached(utlandskDescriptor, adminLevel, STAT_YEAR)
          .then(r => {
            if (r.kind !== 'scalar') { return; }
            setUtlandskUnit(r.unit);
            const all  = Object.values(r.values).filter(Number.isFinite) as number[];
            const mean = all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
            const v    = r.values[code];
            setUtlandsk(Number.isFinite(v) ? { value: v, mean } : null);
          })
          .catch(() => {}),
      );
    }

    Promise.all(statFetches).then(() => {
      if (id !== fetchIdRef.current) { return; }
      setStatsLoading(false);
    });

    if (PYRAMID_LEVELS.includes(adminLevel)) {
      setPyramidLoading(true);
      fetchAgeGenderBreakdown(adminLevel as 'RegSO' | 'DeSO', code, STAT_YEAR)
        .then(rows => {
          if (id !== fetchIdRef.current) { return; }
          setPyramid(rows);
          setPyramidLoading(false);
        })
        .catch(() => { if (id === fetchIdRef.current) { setPyramidLoading(false); } });
    }
  }, [selectedFeature, adminLevel]);

  if (!selectedFeature) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
        Klicka på ett område på kartan för att se profil.
      </div>
    );
  }

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
            <StatMini label="Befolkning"     value={population?.value ?? null} mean={population?.mean ?? null} unit={popUnit}    />
            {income     && <StatMini label="Medianinkomst"    value={income.value}     mean={income.mean}     unit={incomeUnit}    />}
            {age        && <StatMini label="Medelålder"       value={age.value}        mean={age.mean}        unit={ageUnit}       />}
            {employment && <StatMini label="Sysselsättning"   value={employment.value} mean={employment.mean} unit={employUnit}    />}
            {utlandsk   && <StatMini label="Utländsk bakgrund" value={utlandsk.value}  mean={utlandsk.mean}   unit={utlandskUnit}  />}
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
