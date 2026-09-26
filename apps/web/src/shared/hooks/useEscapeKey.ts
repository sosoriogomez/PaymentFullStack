import { type RefObject, useEffect, useRef } from 'react';

/** Calls `onEscape` when Escape is pressed inside `containerRef` while active. */
export function useEscapeKey(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape: (() => void) | undefined,
): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !handler.current) return;
      event.stopPropagation();
      handler.current();
    };
    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [active, containerRef]);
}
