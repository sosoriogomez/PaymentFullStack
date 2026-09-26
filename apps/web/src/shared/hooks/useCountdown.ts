import { useEffect, useRef, useState } from 'react';

const SECOND_MS = 1000;

/**
 * Visible countdown that calls `onDone` at zero. Cancelable so the user can stay (WCAG 2.2.1:
 * timing adjustable).
 */
export function useCountdown(seconds: number, active: boolean, onDone: () => void) {
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active || cancelled) return undefined;
    if (remaining <= 0) {
      done.current();
      return undefined;
    }
    const timer = setTimeout(() => {
      setRemaining((value) => value - 1);
    }, SECOND_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [active, cancelled, remaining]);

  const cancel = () => {
    setCancelled(true);
  };
  return { remaining, running: active && !cancelled, cancel };
}
