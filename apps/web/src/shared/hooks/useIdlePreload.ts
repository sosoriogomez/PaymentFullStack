import { useEffect } from 'react';

/** Upper bound for requestIdleCallback, and the delay where it does not exist (Safari). */
const IDLE_DELAY_MS = 2000;

/**
 * Downloads deferred chunks once the page is idle, after its own content (LCP) is done. A failed
 * prefetch is ignored: the lazy component requests the chunk again when it renders.
 */
export function useIdlePreload(preload: () => Promise<unknown>) {
  useEffect(() => {
    const run = () => {
      preload().catch(() => undefined);
    };
    // The DOM typings always declare it, but Safari does not implement it.
    if (typeof (window as Partial<Window>).requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: IDLE_DELAY_MS });
      return () => {
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(run, IDLE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [preload]);
}
