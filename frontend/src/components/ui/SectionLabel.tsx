import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Canonical eyebrow / section label.
 * Use this wherever a small-caps label appears above a control, stat, or
 * section of content. Replaces the ad-hoc strings like
 * "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400"
 * that were scattered across components.
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span className={cn('text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400', className)}>
      {children}
    </span>
  );
}
