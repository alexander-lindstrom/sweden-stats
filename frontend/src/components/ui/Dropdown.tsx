import { useEffect, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  inputSize?: 'sm' | 'md';
  wrapperClassName?: string;
}

export function Dropdown({ value, onChange, options, inputSize = 'md', wrapperClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const isSm = inputSize === 'sm';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} className={`relative ${wrapperClassName ?? ''}`} onKeyDown={handleKey}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={[
          'w-full flex items-center justify-between gap-2',
          'bg-white font-medium text-slate-700 text-left',
          'border rounded-lg transition-colors',
          open
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-300 hover:border-slate-400',
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        ].join(' ')}
      >
        <span className="truncate">{selected?.label ?? '—'}</span>
        <svg
          className={`flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Option list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-max bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={[
                'w-full text-left transition-colors',
                isSm ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
                opt.value === value
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
