import React, { forwardRef } from 'react';

interface TooltipProps {
  visible: boolean;
  children: React.ReactNode;
}

/**
 * A lightweight floating tooltip. Position is managed externally via the
 * forwarded ref (set `style.left` / `style.top` directly for zero-re-render
 * cursor tracking). The component is always mounted so the ref is always valid;
 * visibility is toggled via CSS.
 */
export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ visible, children }, ref) => (
    <div
      ref={ref}
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      className="absolute z-50 pointer-events-none bg-gray-900/90 text-white text-xs px-2.5 py-1.5 rounded shadow-md whitespace-nowrap"
    >
      {children}
    </div>
  )
);

Tooltip.displayName = 'Tooltip';
