import { useEffect, useState } from 'react';

/**
 * Reads `prefers-reduced-motion: reduce` and stays in sync with system
 * changes. Components use the return value as a hard gate around any
 * anime.js call so reduced-motion users see the final, fully visible
 * state immediately.
 */
export function useReducedMotion(): boolean {
  const get = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [reduced, setReduced] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    // addEventListener is supported on modern browsers; keep the deprecated
    // addListener fallback for old Safari.
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  return reduced;
}
