import { useEffect, useRef, useState } from 'react';
import type { AdminLevel, ElectionDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS, LEVEL_BADGE } from '@/datasets/adminLevels';
import { DATASETS } from '@/datasets/registry';
import { fetchCached } from '@/datasets/cache';
import { fetchAgeGenderBreakdown, type PyramidRow } from '@/datasets/scb/population';
import { PopulationPyramid } from '@/components/visualizations/PopulationPyramid';
import { ElectionDonut } from '@/components/visualizations/ElectionDonut';
import { ProfileSection } from './ProfileSection';
import { ProfileCard } from './ProfileCard';
import { Spinner } from '@/components/ui/Spinner';

const popDescriptor         = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor      = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor         = DATASETS.find(d => d.id === 'medelalder')!;
const employmentDescriptor  = DATASETS.find(d => d.id === 'sysselsattning')!;
const riksdagsvalDescriptor = DATASETS.find(d => d.id === 'riksdagsval')!;

const STAT_YEAR     = 2024;
const ELECTION_YEAR = 2022;
const PYRAMID_LEVELS: AdminLevel[] = ['RegSO', 'DeSO'];
const INCOME_LEVELS:     AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:        AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const EMPLOYMENT_LEVELS: AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];

function StatMini({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 mb-1">{label}</div>
      {value === null ? (
        <div className="text-sm text-slate-300">—</div>
      ) : (
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tabular-nums text-slate-900">{value.toLocaleString('sv-SE')}</span>
          {unit && <span className="text-xs text-slate-500">{unit}</span>}
        </div>
      )}
    </div>
  );
}

interface Props {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
}

export function FeatureProfile({ selectedFeature, adminLevel }: Props) {
  const [population,   setPopulation]   = useState<number | null>(null);
  const [popUnit,      setPopUnit]      = useState('');
  const [income,       setIncome]       = useState<number | null>(null);
  const [incomeUnit,   setIncomeUnit]   = useState('');
  const [age,          setAge]          = useState<number | null>(null);
  const [ageUnit,      setAgeUnit]      = useState('');
  const [employment,   setEmployment]   = useState<number | null>(null);
  const [employUnit,   setEmployUnit]   = useState('');
  const [statsLoading, setStatsLoading] = useState(false);

  const [pyramid,        setPyramid]        = useState<PyramidRow[]>([]);
  const [pyramidLoading, setPyramidLoading] = useState(false);

  const [electionVotes,   setElectionVotes]   = useState<Record<string, number> | null>(null);
  const [electionLoading, setElectionLoading] = useState(false);

  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!selectedFeature) {
      setPopulation(null);
      setIncome(null);
      setAge(null);
      setEmployment(null);
      setPyramid([]);
      setElectionVotes(null);
      return;
    }

    const id   = ++fetchIdRef.current;
    const code = selectedFeature.code;

    setPopulation(null);
    setIncome(null);
    setAge(null);
    setEmployment(null);
    setStatsLoading(true);
    setPyramid([]);
    setElectionVotes(null);

    const wantsIncome     = INCOME_LEVELS.includes(adminLevel);
    const wantsAge        = AGE_LEVELS.includes(adminLevel);
    const wantsEmployment = EMPLOYMENT_LEVELS.includes(adminLevel);

    const statFetches: Promise<void>[] = [
      fetchCached(popDescriptor, adminLevel, STAT_YEAR)
        .then(r => {
          if (r.kind !== 'scalar') { return; }
          setPopUnit(r.unit);
          const v = r.values[code];
          setPopulation(Number.isFinite(v) ? v : null);
        })
        .catch(() => {}),
    ];

    if (wantsIncome) {
      statFetches.push(
        fetchCached(incomeDescriptor, adminLevel, STAT_YEAR)
          .then(r => {
            if (r.kind !== 'scalar') { return; }
            setIncomeUnit(r.unit);
            const v = r.values[code];
            setIncome(Number.isFinite(v) ? v : null);
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
            const v = r.values[code];
            setAge(Number.isFinite(v) ? v : null);
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
            const v = r.values[code];
            setEmployment(Number.isFinite(v) ? v : null);
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

    setElectionLoading(true);
    fetchCached(riksdagsvalDescriptor, adminLevel, ELECTION_YEAR)
      .then(r => {
        if (id !== fetchIdRef.current) { return; }
        if (r.kind === 'election') {
          const votes = (r as ElectionDatasetResult).partyVotes[code];
          setElectionVotes(votes ?? null);
        }
        setElectionLoading(false);
      })
      .catch(() => { if (id === fetchIdRef.current) { setElectionLoading(false); } });
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatMini label="Befolkning"     value={population} unit={popUnit}    />
            {income     !== null && <StatMini label="Medianinkomst"  value={income}     unit={incomeUnit} />}
            {age        !== null && <StatMini label="Medelålder"     value={age}        unit={ageUnit}    />}
            {employment !== null && <StatMini label="Sysselsättning" value={employment} unit={employUnit} />}
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

      <ProfileSection title="Val">
        {electionLoading ? <Spinner /> :
          electionVotes
            ? (
              <ProfileCard title={`Riksdagsval ${ELECTION_YEAR}`}>
                <ElectionDonut votes={electionVotes} size={72} />
              </ProfileCard>
            )
            : (
              <p className="text-sm text-slate-400">Ingen valdata tillgänglig.</p>
            )
        }
      </ProfileSection>
    </div>
  );
}
