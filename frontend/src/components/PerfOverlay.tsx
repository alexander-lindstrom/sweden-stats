import { useEffect, useState } from 'react';
import { useFetchTiming, type FetchSource } from '@/datasets/fetchTiming';
import { getIdbStats, MAX_ENTRIES } from '@/datasets/idbCache';

const SOURCE_STYLES: Record<FetchSource, { label: string; className: string }> = {
  memory:  { label: 'mem',     className: 'bg-emerald-600' },
  idb:     { label: 'idb',     className: 'bg-blue-600' },
  network: { label: 'network', className: 'bg-amber-600' },
};

function formatDuration(ms: number): string {
  return ms < 1000
    ? `${Math.round(ms)}ms`
    : `${(ms / 1000).toFixed(1)}s`;
}

function formatKey(key: string): string {
  // "befolkning:Municipality:2023" → "befolkning · Municipality · 2023"
  return key.replace(/:/g, ' · ');
}

export default function PerfOverlay() {
  const entries = useFetchTiming();
  const [stats, setStats] = useState<{ count: number; usageMb: number } | null>(null);

  useEffect(() => {
    getIdbStats().then(setStats);
  }, [entries]);

  const statsLabel = stats
    ? `idb: ${stats.count}/${MAX_ENTRIES} entries · ${stats.usageMb.toFixed(1)} MB`
    : 'idb: …';

  if (entries.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] rounded-lg bg-black/80 px-3 py-2 text-xs text-white/50 font-mono">
        perf · no fetches yet · {statsLabel}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] rounded-lg bg-black/85 backdrop-blur-sm shadow-xl overflow-hidden min-w-64">
      <div className="px-3 py-1.5 text-[10px] font-mono text-white/40 border-b border-white/10">
        perf · last {entries.length} fetches · {statsLabel}
      </div>
      <ul className="divide-y divide-white/5">
        {entries.slice(0, 8).map((entry, i) => {
          const { label, className } = SOURCE_STYLES[entry.source];
          return (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`${className} rounded px-1.5 py-0.5 text-[10px] font-mono text-white font-semibold shrink-0`}>
                {label}
              </span>
              <span className="flex-1 text-[11px] font-mono text-white/70 truncate">
                {formatKey(entry.key)}
              </span>
              <span className="text-[11px] font-mono text-white/50 shrink-0">
                {formatDuration(entry.durationMs)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
