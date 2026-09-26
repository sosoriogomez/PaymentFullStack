import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aProduct } from '@test/builders';
import { es } from '@/shared/i18n/es';
import { formatCOP } from '@/shared/lib/money';
import { ProductCard } from './ProductCard';
import { StockBadge } from './StockBadge';

describe('ProductCard', () => {
  it('should show the name, description, price and units in stock', () => {
    const product = aProduct({ stock: 5 });
    render(<ProductCard product={product} onBuy={jest.fn()} />);

    const card = screen.getByRole('article', { name: product.name });
    expect(card).toHaveTextContent(product.description);
    expect(card.textContent).toContain(formatCOP(product.priceInCents));
    expect(card).toHaveTextContent('5 disponibles');
  });

  it('should buy the selected quantity', async () => {
    const onBuy = jest.fn();
    render(<ProductCard product={aProduct({ stock: 5 })} onBuy={onBuy} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    await userEvent.click(screen.getByRole('button', { name: es.catalog.payWithCard }));

    expect(onBuy).toHaveBeenCalledWith(aProduct().id, 2);
  });

  it('should never let the quantity go above the stock', async () => {
    render(<ProductCard product={aProduct({ stock: 2 })} onBuy={jest.fn()} />);
    const more = screen.getByRole('button', { name: 'Aumentar cantidad' });

    await userEvent.click(more);

    expect(screen.getByRole('group', { name: 'Cantidad' })).toHaveTextContent('2');
    expect(more).toBeDisabled();
  });

  it('should cap the quantity at 10 units even with more stock', async () => {
    render(<ProductCard product={aProduct({ stock: 50 })} onBuy={jest.fn()} />);
    const more = screen.getByRole('button', { name: 'Aumentar cantidad' });

    for (let i = 0; i < 12; i += 1) await userEvent.click(more);

    expect(screen.getByRole('group', { name: 'Cantidad' })).toHaveTextContent('10');
  });

  it('should show sold out products as unavailable', () => {
    render(<ProductCard product={aProduct({ stock: 0 })} onBuy={jest.fn()} />);

    expect(screen.getByText(es.catalog.soldOut)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: es.catalog.payWithCard })).toBeDisabled();
  });
});

describe('StockBadge', () => {
  it.each([
    [0, 'Agotado', 'soldOut'],
    [1, '1 disponible', 'low'],
    [3, '3 disponibles', 'low'],
    [4, '4 disponibles', 'available'],
  ])('with %i units should read %p', (stock, text, tone) => {
    render(<StockBadge stock={stock} />);

    expect(screen.getByText(text)).toHaveClass(tone);
  });
});
