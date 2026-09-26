import { type RefObject, useEffect } from 'react';
import { focusableElements } from './focusable';

/**
 * While active: moves focus inside `containerRef` (to `initialFocusRef` or the first focusable
 * element), keeps Tab / Shift+Tab inside, and gives focus back to the trigger when it ends.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialFocusRef?.current ?? focusableElements(container)[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusableElements(container);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
