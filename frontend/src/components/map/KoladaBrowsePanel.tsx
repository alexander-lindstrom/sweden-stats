import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Bookmark, BookmarkCheck, Search } from 'lucide-react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import type { KoladaDescriptorConfig } from '@/datasets/kolada/factory';
import { extractUnit, stripUnit, makeKoladaDescriptorFromMeta } from '@/datasets/kolada/factory';
import { getKoladaKpiCatalog } from '@/datasets/kolada/catalogCache';
import type { KoladaKpiMeta } from '@/datasets/kolada/api';
import { getKoladaPresetIds } from '@/datasets/registry';

// Derived once from the static registry — stays in sync automatically when presets are added/removed.
const PRESET_KPI_IDS = getKoladaPresetIds();

// ── Client-side search ────────────────────────────────────────────────────────

function filterAndSort(catalog: KoladaKpiMeta[], query: string): KoladaKpiMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) { return []; }

  const matches = catalog.filter(kpi =>
    kpi.title.toLowerCase().includes(q) ||
    kpi.id.toLowerCase().startsWith(q),
  );

  // Titles that start with the query float to the top, then alphabetical (sv).
  matches.sort((a, b) => {
    const aStart = a.title.toLowerCase().startsWith(q) ? 0 : 1;
    const bStart = b.title.toLowerCase().startsWith(q) ? 0 : 1;
    return aStart - bStart || a.title.localeCompare(b.title, 'sv');
  });

  return matches.slice(0, 30);
}

// ── Result row ────────────────────────────────────────────────────────────────

function KpiRow({
  kpi,
  isPinned,
  isPreset,
  onPin,
  onUnpin,
}: {
  kpi:      KoladaKpiMeta;
  isPinned: boolean;
  isPreset: boolean;
  onPin:    (cfg: KoladaDescriptorConfig) => void;
  onUnpin:  (kpiId: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800 leading-snug">
            {stripUnit(kpi.title)}
          </span>
          {extractUnit(kpi.title) && (
            <span className="text-xs text-slate-400 font-mono flex-shrink-0">
              {extractUnit(kpi.title)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-slate-400">{kpi.id}</span>
          {kpi.operating_area && (
            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {kpi.operating_area}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 pt-0.5">
        {isPreset ? (
          <span className="text-[10px] text-slate-400 italic">ingår redan</span>
        ) : isPinned ? (
          <button
            onClick={() => onUnpin(kpi.id)}
            title="Ta bort"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-red-500 transition-colors font-medium"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            Tillagd
          </button>
        ) : (
          <button
            onClick={() => onPin(makeKoladaDescriptorFromMeta(kpi))}
            title="Lägg till"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors font-medium"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Lägg till
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pinned KPI row (shown in the "your indicators" section) ───────────────────

function PinnedRow({
  cfg,
  onUnpin,
}: {
  cfg:     KoladaDescriptorConfig;
  onUnpin: (kpiId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 last:border-0 group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700 truncate block">{cfg.label}</span>
        <span className="text-[10px] font-mono text-slate-400">{cfg.kpiId}</span>
      </div>
      <button
        onClick={() => onUnpin(cfg.kpiId)}
        title="Ta bort"
        className="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface KoladaBrowsePanelProps {
  open:          boolean;
  onClose:       () => void;
  pinnedKpiIds:  Set<string>;
  pinnedConfigs: KoladaDescriptorConfig[];
  onPin:         (cfg: KoladaDescriptorConfig) => void;
  onUnpin:       (kpiId: string) => void;
}

export function KoladaBrowsePanel({
  open,
  onClose,
  pinnedKpiIds,
  pinnedConfigs,
  onPin,
  onUnpin,
}: KoladaBrowsePanelProps) {
  const [catalog,      setCatalog]      = useState<KoladaKpiMeta[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [query,        setQuery]        = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Trigger catalog load when panel first opens.
  useEffect(() => {
    if (!open) { return; }
    setTimeout(() => inputRef.current?.focus(), 50);
    if (catalog) { return; } // already loaded

    setCatalogError(false);
    getKoladaKpiCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true));
  }, [open, catalog]);

  // Clear search on close.
  useEffect(() => {
    if (!open) { setQuery(''); }
  }, [open]);

  // Client-side filter — instant, no network calls.
  const results = useMemo(
    () => (catalog ? filterAndSort(catalog, query) : []),
    [catalog, query],
  );

  if (!open) { return null; }

  const catalogLoading = !catalog && !catalogError;
  const showPinned     = !query.trim() && pinnedConfigs.length > 0;
  const showResults    = !!catalog && query.trim().length > 0;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-16 px-4 pb-8"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 8rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Kolada KPI-katalog</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {catalog ? `${catalog.length} indikatorer` : '~4 500 kommunala indikatorer'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { onClose(); } }}
              placeholder={catalogLoading ? 'Laddar katalog…' : 'Sök på indikatorns namn…'}
              disabled={catalogLoading}
              className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
            {query && (
              <button
                tabIndex={-1}
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Catalog loading */}
          {catalogLoading && (
            <div className="px-4 py-10 text-center text-slate-400 text-sm">
              Laddar katalog…
            </div>
          )}

          {/* Catalog error */}
          {catalogError && (
            <div className="px-4 py-10 text-center text-red-400 text-sm">
              Katalogen kunde inte laddas. Kontrollera din anslutning och försök igen.
            </div>
          )}

          {/* Pinned KPIs (shown when search is empty and catalog is ready) */}
          {showPinned && (
            <div>
              <div className="px-4 pt-3 pb-1">
                <SectionLabel className="font-bold text-slate-500">Dina indikatorer</SectionLabel>
              </div>
              {pinnedConfigs.map(cfg => (
                <PinnedRow key={cfg.kpiId} cfg={cfg} onUnpin={onUnpin} />
              ))}
            </div>
          )}

          {/* Empty state (catalog ready, no query, no pinned) */}
          {catalog && !query.trim() && pinnedConfigs.length === 0 && (
            <div className="px-4 py-12 text-center text-slate-400 text-sm">
              Sök för att hitta indikatorer och lägga till dem i kartan.
            </div>
          )}

          {/* No results */}
          {showResults && results.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              Inga indikatorer matchade "{query.trim()}".
            </div>
          )}

          {/* Results */}
          {showResults && results.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <SectionLabel className="font-bold text-slate-500">Resultat</SectionLabel>
                <span className="text-[10px] text-slate-400">{results.length} träffar</span>
              </div>
              {results.map(kpi => (
                <KpiRow
                  key={kpi.id}
                  kpi={kpi}
                  isPinned={pinnedKpiIds.has(kpi.id)}
                  isPreset={PRESET_KPI_IDS.has(kpi.id)}
                  onPin={onPin}
                  onUnpin={onUnpin}
                />
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
