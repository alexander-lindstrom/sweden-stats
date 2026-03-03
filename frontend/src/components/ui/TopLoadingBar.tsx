import { useEffect, useState } from 'react';

interface Props {
  loading: boolean;
}

type Phase = 'hidden' | 'running' | 'completing' | 'fading';

/**
 * Thin progress bar fixed to the top of the viewport.
 * Mounts at 0 %, animates quickly to ~80 %, then snaps to 100 % and fades out.
 */
export function TopLoadingBar({ loading }: Props) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [width, setWidth] = useState(0);

  // Drive phase from the loading prop.
  useEffect(() => {
    if (loading) {
      setWidth(0);
      setPhase('running');
    } else {
      setPhase(prev => (prev === 'hidden' ? 'hidden' : 'completing'));
    }
  }, [loading]);

  // Phase transitions. The 'running' effect also drives the animated width:
  // we mount at 0 then set the target one frame later so CSS transition fires.
  useEffect(() => {
    if (phase === 'running') {
      const t = setTimeout(() => setWidth(82), 16);
      return () => clearTimeout(t);
    }
    if (phase === 'completing') {
      setWidth(100);
      const t = setTimeout(() => setPhase('fading'), 250);
      return () => clearTimeout(t);
    }
    if (phase === 'fading') {
      const t = setTimeout(() => { setPhase('hidden'); setWidth(0); }, 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === 'hidden') { return null; }

  const opacity    = phase === 'fading' ? 0 : 1;
  const transition = phase === 'running'
    ? 'width 6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'   // ease-out: fast start, slow crawl
    : 'width 0.22s ease-out, opacity 0.4s ease-out';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 pointer-events-none">
      <div
        className="h-full bg-blue-500"
        style={{ width: `${width}%`, opacity, transition, boxShadow: '0 0 8px rgba(59,130,246,0.7)' }}
      />
    </div>
  );
}
