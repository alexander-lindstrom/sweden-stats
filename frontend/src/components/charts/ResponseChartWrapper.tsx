import useResizeObserver from '@/hooks/useResizeObserver';
import React, { useRef } from 'react';

type ResponsiveChartWrapperProps = {
  aspectRatio?: number;
  minHeight?: number;
  children: (dimensions: { width: number; height: number }) => React.ReactNode;
};

const ResponsiveChartWrapper: React.FC<ResponsiveChartWrapperProps> = ({
  aspectRatio = 0.6,
  minHeight = 300,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(containerRef);

  if (!dimensions) {
    return <div ref={containerRef} className="w-full" style={{ minHeight }} />;
  }

  const { width } = dimensions;
  const height = Math.max(width * aspectRatio, minHeight);

  return (
    <div ref={containerRef} className="w-full">
      {children({ width, height })}
    </div>
  );
};

export default ResponsiveChartWrapper;
