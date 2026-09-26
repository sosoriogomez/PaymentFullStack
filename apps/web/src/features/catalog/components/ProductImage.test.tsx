import { render, screen } from '@testing-library/react';
import { imageUrl, ProductImage } from './ProductImage';

describe('ProductImage', () => {
  it('should offer AVIF, then WebP, then JPG in three widths', () => {
    const { container } = render(<ProductImage imageKey="smartwatch" alt="Reloj" />);

    const sources = container.querySelectorAll('source');
    expect(sources[0]).toHaveAttribute('type', 'image/avif');
    expect(sources[0]?.getAttribute('srcset')).toBe(
      '/images/products/smartwatch-320.avif 320w, /images/products/smartwatch-640.avif 640w, /images/products/smartwatch-960.avif 960w',
    );
    expect(sources[1]).toHaveAttribute('type', 'image/webp');
    expect(screen.getByRole('img', { name: 'Reloj' })).toHaveAttribute(
      'src',
      '/images/products/smartwatch-640.jpg',
    );
  });

  it('should reserve its space and load lazily by default', () => {
    render(<ProductImage imageKey="smartwatch" alt="Reloj" />);

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('width', '640');
    expect(image).toHaveAttribute('height', '480');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('fetchpriority', 'auto');
  });

  it('should load the priority (LCP) image eagerly with high priority', () => {
    render(<ProductImage imageKey="smartwatch" alt="Reloj" priority />);

    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
    expect(screen.getByRole('img')).toHaveAttribute('fetchpriority', 'high');
  });

  it('should encode the image key in the url', () => {
    expect(imageUrl('a b', 320, 'webp')).toBe('/images/products/a%20b-320.webp');
  });
});
