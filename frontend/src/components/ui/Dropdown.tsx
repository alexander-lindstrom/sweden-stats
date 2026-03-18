import * as Select from '@radix-ui/react-select';

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

// Radix Select.Item forbids empty-string values. Use a sentinel internally.
const EMPTY_SENTINEL = '__empty__';
const toRadix  = (v: string) => v === '' ? EMPTY_SENTINEL : v;
const fromRadix = (v: string) => v === EMPTY_SENTINEL ? '' : v;

export function Dropdown({ value, onChange, options, inputSize = 'md', wrapperClassName }: DropdownProps) {
  const isSm = inputSize === 'sm';
  const selected = options.find(o => o.value === value);

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
    <Select.Root value={toRadix(value)} onValueChange={v => onChange(fromRadix(v))}>
      <Select.Trigger
        className={[
          'w-full flex items-center justify-between gap-2',
          'bg-white font-medium text-slate-700 text-left',
          'border rounded-lg transition-colors outline-none',
          'data-[state=open]:border-blue-500 data-[state=open]:ring-2 data-[state=open]:ring-blue-500/20',
          'border-slate-300 hover:border-slate-400',
          'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        ].join(' ')}
      >
        <Select.Value>
          <span className="truncate">{selected?.label ?? '—'}</span>
        </Select.Value>
        <Select.Icon className="flex-shrink-0">
          <svg
            className={`text-slate-400 transition-transform duration-150 ${isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className={[
            'z-[9999] bg-white rounded-lg border border-slate-200 shadow-lg',
            'overflow-hidden',
            'min-w-[var(--radix-select-trigger-width)]',
            'max-h-[min(240px,var(--radix-select-content-available-height))]',
          ].join(' ')}
        >
          <Select.Viewport className="overflow-y-auto max-h-[inherit]">
            {options.map(opt => (
              <Select.Item
                key={opt.value}
                value={toRadix(opt.value)}
                className={[
                  'w-full text-left cursor-default select-none outline-none',
                  'transition-colors',
                  isSm ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
                  'text-slate-700',
                  'data-[highlighted]:bg-slate-50 data-[highlighted]:text-slate-900',
                  'data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-semibold',
                ].join(' ')}
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
    </div>
  );
}
