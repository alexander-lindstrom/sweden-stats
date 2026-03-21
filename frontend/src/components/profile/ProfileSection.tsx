import { useState } from 'react';

export function ProfileSection({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-4 group"
      >
        <span className="text-sm font-bold uppercase tracking-[0.10em] text-slate-500 whitespace-nowrap">
          {title}
        </span>
        <div className="flex-1 h-px bg-slate-200 group-hover:bg-slate-300 transition-colors" />
        <svg
          className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}
        >
          <path d="M2 4.5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}
