import useResizeObserver from '@/hooks/useResizeObserver';
import React, { useRef } from 'react';

type ResponsiveChartWrapperProps = {
  aspectRatio?: number;
  minHeight?: number;
  children: (dimensions: { width: number; height: number }) => React.ReactNode;
};

const ResponsiveChartWrapper: React.FC<ResponsiveChartWrapperProps> = ({
  aspectRatio = 1,
  minHeight = 300,
  children,
}) => {
  console.log("ads")
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(containerRef); 

  console.log(dimensions)

  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
    console.log("failure")
    return <div ref={containerRef} className="w-full h-full" style={{ minHeight: `${minHeight}px` }} />; 
  }

  const { width: containerWidth, height: containerHeight } = dimensions;

  let chartWidth = containerWidth;
  let chartHeight = containerWidth * aspectRatio;

  if (chartHeight > containerHeight) {
    chartHeight = containerHeight;
    chartWidth = containerHeight / aspectRatio;
  }

  chartHeight = Math.max(chartHeight, minHeight);
  chartWidth = Math.min(chartWidth, containerWidth);
  chartHeight = Math.min(chartHeight, containerHeight);


  return (
    <div ref={containerRef} className="w-full h-full"> 
      {children({ width: chartWidth, height: chartHeight })}
    </div>
  );
};

export default ResponsiveChartWrapper;