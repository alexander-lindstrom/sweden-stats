import { UI } from '@/theme';

export function ProfileCard({ title, subtitle, children }: {
  title?:    React.ReactNode;
  subtitle?: string;
  children:  React.ReactNode;
}) {
  return (
    <div className={UI.card}>
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 min-w-0">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
