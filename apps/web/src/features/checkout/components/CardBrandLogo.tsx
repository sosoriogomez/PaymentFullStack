import { siMastercard, siVisa } from 'simple-icons';
import { type CardBrand } from '../domain/card-number';
import styles from './CardBrandLogo.module.css';

const ICONS = { VISA: siVisa, MASTERCARD: siMastercard } as const;

export interface CardBrandLogoProps {
  readonly brand: CardBrand;
}

/** simple-icons exports data (path + hex), not components (I-11): the accessible svg is built here. */
export function CardBrandLogo({ brand }: CardBrandLogoProps) {
  if (brand === 'UNKNOWN') return null;
  const icon = ICONS[brand];
  return (
    <svg className={styles.logo} role="img" aria-label={icon.title} viewBox="0 0 24 24">
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}
