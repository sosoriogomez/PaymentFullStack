import styles from './ProductImage.module.css';

export const IMAGE_WIDTHS = [320, 640, 960] as const;
const FALLBACK_WIDTH = 640;
/** Card width: full width on phones, half on tablets, a third on desktop. */
const SIZES = '(min-width: 1024px) 33vw, (min-width: 600px) 50vw, 100vw';

type ImageFormat = 'avif' | 'webp' | 'jpg';

export const imageUrl = (imageKey: string, width: number, format: ImageFormat): string =>
  `/images/products/${encodeURIComponent(imageKey)}-${width}.${format}`;

const srcSet = (imageKey: string, format: ImageFormat): string =>
  IMAGE_WIDTHS.map((width) => `${imageUrl(imageKey, width, format)} ${width}w`).join(', ');

export interface ProductImageProps {
  readonly imageKey: string;
  readonly alt: string;
  /** The first image is the LCP element: load it eagerly with high priority. */
  readonly priority?: boolean;
}

/** AVIF → WebP → JPG with responsive sizes and fixed dimensions (no layout shift). */
export function ProductImage({ imageKey, alt, priority = false }: ProductImageProps) {
  return (
    <picture className={styles.picture}>
      <source type="image/avif" srcSet={srcSet(imageKey, 'avif')} sizes={SIZES} />
      <source type="image/webp" srcSet={srcSet(imageKey, 'webp')} sizes={SIZES} />
      <img
        className={styles.image}
        src={imageUrl(imageKey, FALLBACK_WIDTH, 'jpg')}
        srcSet={srcSet(imageKey, 'jpg')}
        sizes={SIZES}
        width={640}
        height={480}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </picture>
  );
}
