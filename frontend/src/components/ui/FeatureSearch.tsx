import { useEffect, useMemo, useRef, useState } from 'react';

export interface FeatureSearchItem {
  code:  string;
  label: string;
}

interface FeatureSearchProps {
  items:               FeatureSearchItem[];
  onSelect:            (f: FeatureSearchItem) => void;
  onComparisonSelect?: (f: FeatureSearchItem) => void;
  placeholder?:        string;
}

export function FeatureSearch({
  items,
  onSelect,
  onComparisonSelect,
  placeholder = 'Sök område…',
}: FeatureSearchProps) {
  const [query,     setQuery]     = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return []; }
    return items
      .filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.code.toLowerCase().startsWith(q),
      )
      .sort((a, b) => {
        const aPrefix = a.label.toLowerCase().startsWith(q) ? 0 : 1;
        const bPrefix = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        return aPrefix - bPrefix || a.label.localeCompare(b.label, 'sv');
      })
      .slice(0, 10);
  }, [items, query]);

  useEffect(() => { setActiveIdx(0); }, [results]);

  const commit = (item: FeatureSearchItem, shift: boolean) => {
    if (shift && onComparisonSelect) {
      onComparisonSelect(item);
    } else {
      onSelect(item);
    }
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) { return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) { commit(item, e.shiftKey); }
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  const open = results.length > 0;

  return (
    <div className="relative">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <circle cx="11" cy="11" r="6" />
          <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-8 pr-7 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white placeholder:text-slate-400"
        />
        {query && (
          <button
            tabIndex={-1}
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors leading-none"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {results.map((item, i) => (
            <li key={item.code}>
              <button
                onClick={e => commit(item, e.shiftKey)}
                onMouseEnter={() => setActiveIdx(i)}
                className={[
                  'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                  i === activeIdx
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0 font-mono">{item.code}</span>
              </button>
            </li>
          ))}
          {onComparisonSelect && (
            <li className="px-3 py-1 border-t border-slate-100">
              <span className="text-[10px] text-slate-400">Shift+klicka eller Shift+Enter för jämförelse</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
