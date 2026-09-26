import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Money } from '../../../shared/kernel/money';
import { err, ok, type Result } from '../../../shared/kernel/result';

export interface ProductProps {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly price: Money;
  readonly stock: number;
  readonly imageKey: string;
  readonly updatedAt: Date;
}

export type InsufficientStock = Extract<DomainError, { code: 'INSUFFICIENT_STOCK' }>;

/** A product of the catalog and its units in stock. Products are seeded, never created by the API. */
export class Product {
  private constructor(private readonly props: ProductProps) {}

  /** Rebuilds a product from persisted, trusted data. */
  static restore(props: ProductProps): Product {
    return new Product(props);
  }

  get id(): string {
    return this.props.id;
  }

  get sku(): string {
    return this.props.sku;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string {
    return this.props.description;
  }

  get price(): Money {
    return this.props.price;
  }

  get stock(): number {
    return this.props.stock;
  }

  get imageKey(): string {
    return this.props.imageKey;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  hasStock(quantity: number): boolean {
    return this.props.stock >= quantity;
  }

  ensureStockFor(quantity: number): Result<Product, InsufficientStock> {
    return this.hasStock(quantity)
      ? ok(this)
      : err({ code: 'INSUFFICIENT_STOCK', available: this.props.stock, requested: quantity });
  }
}
