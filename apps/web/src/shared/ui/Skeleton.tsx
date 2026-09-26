import { type CSSProperties } from 'react';
import styles from './Feedback.module.css';

export interface SkeletonProps {
  readonly width?: CSSProperties['width'];
  readonly height?: CSSProperties['height'];
  readonly aspectRatio?: CSSProperties['aspectRatio'];
  readonly className?: string;
}

/** Placeholder with the final size of the content, so the layout does not shift (CLS). */
export function Skeleton({ width = '100%', height, aspectRatio, className }: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, className ?? ''].filter(Boolean).join(' ')}
      style={{ width, height, aspectRatio }}
      aria-hidden="true"
    />
  );
}
