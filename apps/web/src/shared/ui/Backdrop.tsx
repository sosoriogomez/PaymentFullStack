import { type ReactNode, type RefObject, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useModalEnvironment } from '../hooks/useModalEnvironment';
import styles from './Backdrop.module.css';

export interface BackdropProps {
  readonly open: boolean;
  /** Context shown on the back layer (e.g. the product being bought). */
  readonly backLayer: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Action next to the front layer title (e.g. "Editar"). */
  readonly headerAction?: ReactNode;
  readonly onEscape?: () => void;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Material Backdrop: a back layer with context and a front layer that slides up with the content
 * (here, the payment summary and the pay button). It behaves as a modal dialog.
 */
export function Backdrop({
  open,
  backLayer,
  title,
  children,
  footer,
  headerAction,
  onEscape,
  initialFocusRef,
}: BackdropProps) {
  const titleId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(layerRef, open, initialFocusRef);
  useModalEnvironment(layerRef, open);
  useEscapeKey(layerRef, open, onEscape);

  if (!open) return null;

  return createPortal(
    <div
      ref={layerRef}
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className={styles.backLayer}>{backLayer}</div>
      <section className={styles.frontLayer}>
        <header className={styles.subheader}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {headerAction}
        </header>
        <div className={styles.content}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
