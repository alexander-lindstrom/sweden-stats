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

const popDescriptor           = DATASETS.find(d => d.id === 'population')!;
const incomeDescriptor        = DATASETS.find(d => d.id === 'medianinkomst')!;
const ageDescriptor           = DATASETS.find(d => d.id === 'medelalder')!;
const foreignBgDescriptor     = DATASETS.find(d => d.id === 'utlandsk_bakgrund')!;
const employmentDescriptor    = DATASETS.find(d => d.id === 'sysselsattning')!;
const riksdagsvalDescriptor   = DATASETS.find(d => d.id === 'riksdagsval')!;

const STAT_YEAR     = 2024;
const ELECTION_YEAR = 2022;

const SPARKLINE_YEARS     = [2000, 2004, 2008, 2012, 2016, 2020, 2024];
const INCOME_LEVELS:      AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const AGE_LEVELS:         AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const FOREIGN_BG_LEVELS:  AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const EMPLOYMENT_LEVELS:  AdminLevel[] = ['Region', 'Municipality', 'RegSO', 'DeSO'];
const ELECTION_LEVELS:    AdminLevel[] = ['Region', 'Municipality'];

interface StatData {
  value:      number | null;
  unit:       string;
  rank:       number | null;
  total:      number | null;
  /** Fraction of peer areas with a strictly lower value (0 = lowest, 1 = highest). */
  percentile: number | null;
}

function toStat(result: ScalarDatasetResult, code: string): StatData {
  const value = result.values[code] ?? null;
  const all   = Object.values(result.values).filter(Number.isFinite) as number[];
  const rank  = value !== null ? all.filter(v => v > value).length + 1 : null;
  const percentile =
    value !== null && all.length > 1
      ? all.filter(v => v < value).length / (all.length - 1)
      : null;
  return { value, unit: result.unit, rank, total: all.length, percentile };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      {children}
    </div>
  );
}

/**
 * Thin horizontal bar showing where a value sits relative to all peers.
 * The vertical tick marks the median (50th percentile).
 */
function PercentileBar({ percentile }: { percentile: number }) {
  const pct = Math.max(0, Math.min(1, percentile)) * 100;
  return (
    // py-2 gives the overflowing dot room above and below the 4px track
    <div className="py-2 relative">
      <div className="relative h-1 rounded-full bg-slate-100">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-200"
          style={{ width: `${pct}%` }}
        />
        {/* Median tick */}
        <div className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: '50%' }} />
        {/* Position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 ring-2 ring-white shadow-sm"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({ label, stat }: { label: string; stat: StatData }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
        {label}
      </div>
      {stat.value === null ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {stat.value.toLocaleString('sv-SE')}
            </span>
            <span className="text-xs text-slate-500">{stat.unit}</span>
            {stat.rank !== null && stat.total !== null && (
              <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
                #{stat.rank}/{stat.total}
              </span>
            )}
          </div>
          {stat.percentile !== null && <PercentileBar percentile={stat.percentile} />}
        </>
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

interface RadarAxis {
  label:      string;
  percentile: number;
  value?:     number | null;
  unit?:      string;
  rank?:      number | null;
  total?:     number | null;
}

const RADAR_WEB = [0.25, 0.5, 0.75, 1] as const;

/**
 * Spider/radar chart showing percentile scores across multiple axes.
 * Hover a vertex dot to see the exact value, percentile, and rank.
 */
function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const N  = axes.length;
  const CX = 108, CY = 80, R = 52;
  const H  = 142;

  const angle = (i: number) => (2 * Math.PI * i / N) - Math.PI / 2;
  const pt = (v: number, i: number): [number, number] => [
    CX + R * v * Math.cos(angle(i)),
    CY + R * v * Math.sin(angle(i)),
  ];
  const ring = (v: number) =>
    axes.map((_, i) => pt(v, i))
      .map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ') + 'Z';

  const valuePath = axes
    .map((a, i) => pt(a.percentile, i))
    .map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ') + 'Z';

  // Build tooltip data when a vertex is hovered.
  const tooltip = hovered !== null ? (() => {
    const axis = axes[hovered];
    const [vx, vy] = pt(axis.percentile, hovered);
    const lines: Array<{ text: string; bold?: boolean }> = [];
    if (axis.value != null) {
      lines.push({ text: `${axis.value.toLocaleString('sv-SE')} ${axis.unit ?? ''}`.trim(), bold: true });
    }
    lines.push({ text: `Percentil: ${Math.round(axis.percentile * 100)}%` });
    if (axis.rank != null && axis.total != null) {
      lines.push({ text: `#${axis.rank} av ${axis.total}` });
    }
    const lineH = 11, padX = 6, padY = 4, boxW = 94;
    const boxH = lines.length * lineH + padY * 2;
    const above = vy >= CY;
    const tx = Math.max(2, Math.min(CX * 2 - boxW - 2, vx - boxW / 2));
    const ty = above ? vy - boxH - 7 : vy + 7;
    return { lines, lineH, padX, padY, boxW, boxH, tx, ty };
  })() : null;

  return (
    <svg width="100%" viewBox={`0 0 ${CX * 2} ${H}`} className="block overflow-visible">
      {/* Web grid */}
      {RADAR_WEB.map(v => (
        <path key={v} d={ring(v)} fill="none"
          stroke={v === 0.5 ? '#94a3b8' : '#e2e8f0'}
          strokeWidth={v === 0.5 ? 1 : 0.75}
          strokeDasharray={v === 0.5 ? '3 3' : undefined}
        />
      ))}
      {/* Axis spokes */}
      {axes.map((_, i) => {
        const [x2, y2] = pt(1, i);
        return <line key={i} x1={CX} y1={CY} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#e2e8f0" strokeWidth={0.75} />;
      })}
      {/* Value polygon */}
      <path d={valuePath} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" />
      {/* Vertex dots */}
      {axes.map((a, i) => {
        const [cx, cy] = pt(a.percentile, i);
        return <circle key={i} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.5} fill="#3b82f6" />;
      })}
      {/* Large transparent hit areas for hover */}
      {axes.map((a, i) => {
        const [cx, cy] = pt(a.percentile, i);
        return (
          <circle key={`hit-${i}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={10}
            fill="transparent" style={{ cursor: 'default' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        );
      })}
      {/* Axis labels — anchor direction follows which side of centre the label is on */}
      {axes.map(({ label }, i) => {
        const [x, y] = pt(1.28, i);
        const anchor = x < CX - 4 ? 'end' : x > CX + 4 ? 'start' : 'middle';
        return (
          <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle"
            fontSize={9} fontWeight={600} fill={hovered === i ? '#3b82f6' : '#64748b'}>
            {label}
          </text>
        );
      })}
      <circle cx={CX} cy={CY} r={2} fill="#e2e8f0" />
      {/* Tooltip */}
      {tooltip && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={tooltip.tx} y={tooltip.ty} width={tooltip.boxW} height={tooltip.boxH}
            rx={3} fill="white" stroke="#cbd5e1" strokeWidth={0.75} />
          {tooltip.lines.map(({ text, bold }, li) => (
            <text key={li}
              x={tooltip.tx + tooltip.padX}
              y={tooltip.ty + tooltip.padY + li * tooltip.lineH + tooltip.lineH * 0.75}
              fontSize={8.5} fontWeight={bold ? 600 : 400} fill="#475569">
              {text}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

const DONUT_R    = 48;
const DONUT_HOLE = 27;
const DONUT_SIZE = DONUT_R * 2 + 4;

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
  population:  StatData;
  income:      StatData | null;
  age:         StatData | null;
  foreignBg:   StatData | null;
  employment:  StatData | null;
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

    const wantsIncome     = INCOME_LEVELS.includes(adminLevel);
    const wantsAge        = AGE_LEVELS.includes(adminLevel);
    const wantsForeignBg  = FOREIGN_BG_LEVELS.includes(adminLevel);
    const wantsEmployment = EMPLOYMENT_LEVELS.includes(adminLevel);
    const wantsElection   = ELECTION_LEVELS.includes(adminLevel);

    let popStat:        StatData | null = null;
    let incomeStat:     StatData | null = null;
    let ageStat:        StatData | null = null;
    let foreignBgStat:  StatData | null = null;
    let employmentStat: StatData | null = null;

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

    if (wantsForeignBg) {
      statFetches.push(
        fetchCached(foreignBgDescriptor, adminLevel, STAT_YEAR)
          .then(r => { foreignBgStat = toStat(r as ScalarDatasetResult, code); })
          .catch(() => {}),
      );
    }

    if (wantsEmployment) {
      statFetches.push(
        fetchCached(employmentDescriptor, adminLevel, STAT_YEAR)
          .then(r => { employmentStat = toStat(r as ScalarDatasetResult, code); })
          .catch(() => {}),
      );
    }

    Promise.all(statFetches).then(() => {
      if (id !== fetchIdRef.current) { return; }
      if (popStat !== null) {
        setStats({
          population:  popStat,
          income:      wantsIncome     ? incomeStat     : null,
          age:         wantsAge        ? ageStat        : null,
          foreignBg:   wantsForeignBg  ? foreignBgStat  : null,
          employment:  wantsEmployment ? employmentStat : null,
        });
      }
      setStatsLoading(false);
    });

    // Sparkline
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

    // Election
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

  // Build radar axes from whatever stats are available (need ≥3 for a meaningful chart).
  const radarAxes: RadarAxis[] = [];
  if (stats) {
    if (stats.population.percentile !== null) {
      radarAxes.push({ label: 'Befolkning', percentile: stats.population.percentile,
        value: stats.population.value, unit: stats.population.unit,
        rank: stats.population.rank, total: stats.population.total });
    }
    if (stats.income != null && stats.income.percentile !== null) {
      radarAxes.push({ label: 'Inkomst', percentile: stats.income.percentile,
        value: stats.income.value, unit: stats.income.unit,
        rank: stats.income.rank, total: stats.income.total });
    }
    if (stats.age != null && stats.age.percentile !== null) {
      radarAxes.push({ label: 'Ålder', percentile: stats.age.percentile,
        value: stats.age.value, unit: stats.age.unit,
        rank: stats.age.rank, total: stats.age.total });
    }
    if (stats.foreignBg != null && stats.foreignBg.percentile !== null) {
      radarAxes.push({ label: 'Utländsk', percentile: stats.foreignBg.percentile,
        value: stats.foreignBg.value, unit: stats.foreignBg.unit,
        rank: stats.foreignBg.rank, total: stats.foreignBg.total });
    }
    if (stats.employment != null && stats.employment.percentile !== null) {
      radarAxes.push({ label: 'Syssels.', percentile: stats.employment.percentile,
        value: stats.employment.value, unit: stats.employment.unit,
        rank: stats.employment.rank, total: stats.employment.total });
    }
  }

  return (
    <div
      aria-hidden={!isOpen}
      className={[
        'flex flex-col bg-white',
        // Mobile: fixed bottom sheet that slides up/down
        'fixed bottom-0 left-0 right-0 z-20',
        'max-h-[65vh] rounded-t-2xl shadow-2xl border-t border-slate-200',
        'transition-transform duration-300 ease-out',
        // Desktop: normal flex panel in the layout
        'sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:z-auto',
        'sm:max-h-none sm:rounded-none sm:shadow-none sm:border-t-0 sm:border-l',
        'sm:w-72 sm:flex-shrink-0',
        // Open / closed
        isOpen ? 'translate-y-0' : 'translate-y-full sm:hidden',
      ].join(' ')}
    >
      {/* Drag handle — mobile only */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
        <div className="w-8 h-1 rounded-full bg-slate-300" />
      </div>

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {!selectedFeature && (
          <p className="text-sm text-slate-400 italic">
            Klicka på ett område på kartan för att se en sammanfattning.
          </p>
        )}

        {selectedFeature && (
          <>
            {/* Radar profile — shown once all three axes are available */}
            {!statsLoading && radarAxes.length >= 3 && (
              <section>
                <SectionTitle>Profil</SectionTitle>
                <ChartCard>
                  <RadarChart axes={radarAxes} />
                </ChartCard>
              </section>
            )}

            {/* Key stats */}
            <section>
              <SectionTitle>Nyckeltal {STAT_YEAR}</SectionTitle>
              {statsLoading && <Spinner />}
              {!statsLoading && !stats && (
                <p className="text-sm text-slate-400">Ingen data tillgänglig.</p>
              )}
              {!statsLoading && stats && (
                <div className="space-y-3">
                  <StatRow label="Befolkning"       stat={stats.population} />
                  {stats.income     && <StatRow label="Medianinkomst"    stat={stats.income}     />}
                  {stats.age        && <StatRow label="Medelålder"       stat={stats.age}        />}
                  {stats.foreignBg  && <StatRow label="Utländsk bakgrund" stat={stats.foreignBg} />}
                  {stats.employment && <StatRow label="Sysselsättning"   stat={stats.employment} />}
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
