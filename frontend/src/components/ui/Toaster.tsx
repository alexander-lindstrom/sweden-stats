import { dismissToast, useToasts } from './toast';

/**
 * Bottom-centre snackbar stack. Mount once, near the top of the page; hooks
 * push messages with showToast().
 */
export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) { return null; }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 w-full sm:w-auto sm:max-w-md bg-gray-900 text-white text-sm rounded-lg shadow-lg pl-4 pr-1.5 py-2"
        >
          <span className="flex-1 leading-snug">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); dismissToast(t.id); }}
              className="flex-shrink-0 text-xs font-semibold text-blue-300 hover:text-white hover:bg-white/10 px-2 py-1 rounded transition-colors"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Stäng"
            className="flex-shrink-0 text-slate-400 hover:text-white hover:bg-white/10 w-6 h-6 flex items-center justify-center rounded text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
