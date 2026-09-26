import { type ReactNode, type RefObject, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useModalEnvironment } from '../hooks/useModalEnvironment';
import styles from './Modal.module.css';

export interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Sticky area for the main action, always visible on small screens. */
  readonly footer?: ReactNode;
  /** When false (e.g. while paying) neither Escape nor the close button dismiss it. */
  readonly dismissible?: boolean;
  readonly closeLabel?: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}

/** Accessible dialog: bottom sheet on phones, centered 480 px dialog from 600 px. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  closeLabel = 'Cerrar',
  initialFocusRef,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, initialFocusRef);
  useModalEnvironment(dialogRef, open);
  useEscapeKey(dialogRef, open, dismissible ? onClose : undefined);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              className={styles.close}
              aria-label={closeLabel}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
