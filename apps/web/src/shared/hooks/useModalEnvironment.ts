import { type RefObject, useEffect } from 'react';

/**
 * While a modal layer is open: everything outside it becomes `inert` (not focusable, hidden from
 * assistive technology) and the page behind it stops scrolling. Both are restored on close.
 */
export function useModalEnvironment(
  layerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    const layer = layerRef.current;
    if (!active || !layer) return undefined;
    const portalRoot = layer.closest('body > *');
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== portalRoot && !element.hasAttribute('inert'),
    );
    siblings.forEach((element) => {
      element.setAttribute('inert', '');
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      siblings.forEach((element) => {
        element.removeAttribute('inert');
      });
      document.body.style.overflow = previousOverflow;
    };
  }, [active, layerRef]);
}
