import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { AdminLevel, ElectionDatasetResult, ScalarDatasetResult } from '@/datasets/types';
import { LEVEL_LABELS } from '@/datasets/adminLevels';
import { fetchCached } from '@/datasets/cache';
import { DATASETS } from '@/datasets/registry';
import { PARTY_CODES, PARTY_COLORS, PARTY_LABELS } from '@/datasets/parties';
import { Spinner } from '@/components/ui/Spinner';

const LEVEL_BADGE: Record<AdminLevel, string> = {
  Country:      'bg-gray-100 text-slate-600',
  Region:       'bg-blue-100 text-blue-700',
  Municipality: 'bg-teal-100 text-teal-700',
  RegSO:        'bg-orange-100 text-orange-700',
  DeSO:         'bg-rose-100 text-rose-700',
};

const popDescriptor        = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor     = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor        = DATASETS.find(d => d.id === 'medelalder')!;
const riksdagsvalDescriptor = DATASETS.find(d => d.id === 'riksdagsval')!;

const STAT_YEAR     = 2024;
const ELECTION_YEAR = 2022;

const SPARKLINE_YEARS = [2000, 2004, 2008, 2012, 2016, 2020, 2024];

const INCOME_LEVELS:   AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:      AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const ELECTION_LEVELS: AdminLevel[] = ['Region', 'Municipality'];

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

// ── Sub-components ────────────────────────────────────────────────────────────

/** Section heading with a hairline rule extending to the right. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

/** Light card wrapper used around chart visuals. */
function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      {children}
    </div>
  );
}

function StatRow({ label, stat }: { label: string; stat: StatData }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
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

  const W = 220, H = 52, pad = 3;
  const vals   = data.map(d => d.value);
  const minV   = Math.min(...vals);
  const maxV   = Math.max(...vals);
  const range  = maxV - minV || 1;
  const innerH = H - pad * 2;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = pad + innerH - ((d.value - minV) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const trend  = vals[vals.length - 1] > vals[0] ? 'up' : vals[vals.length - 1] < vals[0] ? 'down' : 'flat';
  const stroke = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#9ca3af';

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block overflow-visible">
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

const DONUT_R    = 48;
const DONUT_HOLE = 27;
const DONUT_SIZE = DONUT_R * 2 + 4;

/** Mini donut chart — centered above a party legend list. */
function ElectionDonut({ votes }: { votes: Record<string, number> }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rows = PARTY_CODES
      .map(p => ({ party: p, share: votes[p] ?? 0 }))
      .filter(d => d.share > 0);

    if (rows.length === 0) { return; }

    const pie = d3.pie<typeof rows[0]>().sort(null).value(d => d.share);
    const arc = d3.arc<d3.PieArcDatum<typeof rows[0]>>().innerRadius(DONUT_HOLE).outerRadius(DONUT_R);

    const g = svg
      .attr('width', DONUT_SIZE).attr('height', DONUT_SIZE)
      .append('g').attr('transform', `translate(${DONUT_SIZE / 2},${DONUT_SIZE / 2})`);

    g.selectAll('path')
      .data(pie(rows))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => PARTY_COLORS[d.data.party] ?? '#ccc')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    // Winner label in the centre.
    const winner = rows.reduce((a, b) => a.share > b.share ? a : b);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', '-0.2em')
      .attr('font-size', 13).attr('font-weight', 700).attr('fill', '#1e293b')
      .text(winner.party === 'ÖVRIGA' ? 'Övr.' : winner.party);
    g.append('text')
      .attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('font-size', 10).attr('fill', '#64748b')
      .text(`${winner.share.toFixed(0)}%`);
  }, [votes]);

  // Top parties by share for the legend.
  const topParties = PARTY_CODES
    .map(p => ({ p, share: votes[p] ?? 0 }))
    .filter(d => d.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg ref={svgRef} width={DONUT_SIZE} height={DONUT_SIZE} className="flex-shrink-0" />
      <div className="w-full space-y-1">
        {topParties.map(({ p, share }) => (
          <div key={p} className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PARTY_COLORS[p] }} />
            <span className="text-slate-500 truncate flex-1 min-w-0">{PARTY_LABELS[p] ?? p}</span>
            <span className="tabular-nums text-slate-700 flex-shrink-0">{share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SelectionPanelProps {
  selectedFeature: { code: string; label: string } | null;
  adminLevel: AdminLevel;
  isOpen: boolean;
  onClose: () => void;
}

interface PanelStats {
  population: StatData;
  income:     StatData | null;
  age:        StatData | null;
}

export function SelectionPanel({ selectedFeature, adminLevel, isOpen, onClose }: SelectionPanelProps) {
  const [stats,           setStats]           = useState<PanelStats | null>(null);
  const [statsLoading,    setStatsLoading]    = useState(false);
  const [sparkline,       setSparkline]       = useState<Array<{ year: number; value: number }>>([]);
  const [sparkLoading,    setSparkLoading]    = useState(false);
  const [electionVotes,   setElectionVotes]   = useState<Record<string, number> | null>(null);
  const [electionLoading, setElectionLoading] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!selectedFeature) {
      setStats(null);
      setSparkline([]);
      setElectionVotes(null);
      return;
    }

    const id   = ++fetchIdRef.current;
    const code = selectedFeature.code;

    setStats(null);
    setStatsLoading(true);
    setSparkline([]);
    setSparkLoading(true);
    setElectionVotes(null);

    const wantsIncome   = INCOME_LEVELS.includes(adminLevel);
    const wantsAge      = AGE_LEVELS.includes(adminLevel);
    const wantsElection = ELECTION_LEVELS.includes(adminLevel);

    // -- Stats ----------------------------------------------------------------
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

    // -- Sparkline ------------------------------------------------------------
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

    // -- Election -------------------------------------------------------------
    if (wantsElection) {
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
        .catch(() => {
          if (id === fetchIdRef.current) { setElectionLoading(false); }
        });
    }
  }, [selectedFeature, adminLevel]);

  if (!isOpen) { return null; }

  return (
    <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">

      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-200 flex-shrink-0">
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {!selectedFeature && (
          <p className="text-sm text-slate-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <>
            {/* Key stats */}
            <section>
              <SectionTitle>Nyckeltal {STAT_YEAR}</SectionTitle>
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

            {/* Population sparkline */}
            {adminLevel !== 'RegSO' && adminLevel !== 'DeSO' && (
              <section>
                <SectionTitle>Befolkningstrend</SectionTitle>
                {sparkLoading && <Spinner />}
                {!sparkLoading && sparkline.length >= 2 && (
                  <ChartCard>
                    <Sparkline data={sparkline} />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>{sparkline[0].year}</span>
                      <span>{sparkline[sparkline.length - 1].year}</span>
                    </div>
                  </ChartCard>
                )}
                {!sparkLoading && sparkline.length < 2 && (
                  <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
                )}
              </section>
            )}

            {/* Election distribution */}
            {ELECTION_LEVELS.includes(adminLevel) && (
              <section>
                <SectionTitle>Riksdagsval {ELECTION_YEAR}</SectionTitle>
                {electionLoading && <Spinner />}
                {!electionLoading && !electionVotes && (
                  <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
                )}
                {!electionLoading && electionVotes && (
                  <ChartCard>
                    <ElectionDonut votes={electionVotes} />
                  </ChartCard>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
