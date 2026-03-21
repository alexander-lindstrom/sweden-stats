export function ProfileCard({ title, subtitle, children }: {
  title?:    string;
  subtitle?: string;
  children:  React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 shadow-sm">
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
