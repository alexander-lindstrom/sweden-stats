import { SelectHTMLAttributes } from 'react';

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 'sm' for tight/inline contexts, 'md' (default) for standard controls */
  inputSize?: 'sm' | 'md';
  /** Extra classes for the wrapper div */
  wrapperClassName?: string;
}

export function SelectInput({
  inputSize = 'md',
  wrapperClassName,
  className = '',
  children,
  ...props
}: SelectInputProps) {
  const pad   = inputSize === 'sm' ? 'px-2.5 py-1 pr-6 text-xs'    : 'px-3 py-1.5 pr-8 text-sm';
  const arrow = inputSize === 'sm' ? 'right-1.5 h-3 w-3'           : 'right-2 h-3.5 w-3.5';

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      <select
        {...props}
        className={[
          'w-full appearance-none font-medium bg-white text-slate-700',
          'border border-slate-300 rounded-lg',
          'hover:border-slate-400 transition-colors cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          'disabled:opacity-50 disabled:cursor-default',
          pad,
          className,
        ].join(' ')}
      >
        {children}
      </select>
      <div className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${arrow}`}>
        <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
