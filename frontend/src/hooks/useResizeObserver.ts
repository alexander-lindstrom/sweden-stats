import { useEffect, useState } from 'react';

export default function useResizeObserver(ref: React.RefObject<HTMLElement | null>) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [ref]);

  return dimensions;
}