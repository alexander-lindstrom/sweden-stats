import React from 'react';

interface TooltipProps {
  x: number;
  y: number;
  visible: boolean;
  children: React.ReactNode;
}

/**
 * A lightweight floating tooltip, positioned in pixels relative to the nearest
 * `position: relative` ancestor.  The caller is responsible for updating x/y
 * and toggling visible on pointer events.
 */
export const Tooltip: React.FC<TooltipProps> = ({ x, y, visible, children }) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      style={{ left: x + 14, top: y + 14 }}
      className="absolute z-50 pointer-events-none bg-gray-900/90 text-white text-xs px-2.5 py-1.5 rounded shadow-md whitespace-nowrap"
    >
      {children}
    </div>
  );
};
