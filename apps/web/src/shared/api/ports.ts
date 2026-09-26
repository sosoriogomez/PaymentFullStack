import { type Result } from '../lib/result';
import {
  type Acceptance,
  type CreateTransactionInput,
  type Customer,
  type CustomerInput,
  type Delivery,
  type Product,
  type Quote,
  type Stock,
  type Transaction,
} from './contracts';

/** HTTP status + problem code for API errors; `status` is null when the request never got an answer. */
export interface ApiError {
  readonly code: string;
  readonly status: number | null;
  readonly detail: string | null;
}

export const NETWORK_ERROR = 'NETWORK_ERROR';
export const TIMEOUT_ERROR = 'TIMEOUT';
export const INVALID_RESPONSE = 'INVALID_RESPONSE';

export type ApiResult<T> = Promise<Result<T, ApiError>>;

export interface CreatedTransaction {
  readonly transaction: Transaction;
  /** True when the API answered with an idempotent replay of an earlier request. */
  readonly replayed: boolean;
}

/** Port of the Checkout API (spec-frontend §4). */
export interface CheckoutApi {
  listProducts(): ApiResult<Product[]>;
  getProductStock(productId: string): ApiResult<Stock>;
  getAcceptance(): ApiResult<Acceptance>;
  getQuote(input: { productId: string; quantity: number }): ApiResult<Quote>;
  registerCustomer(input: CustomerInput): ApiResult<Customer>;
  createTransaction(
    input: CreateTransactionInput,
    idempotencyKey: string,
  ): ApiResult<CreatedTransaction>;
  getTransaction(transactionId: string): ApiResult<Transaction>;
  findTransactionByIdempotencyKey(idempotencyKey: string): ApiResult<Transaction>;
  getDelivery(deliveryId: string): ApiResult<Delivery>;
}

export interface CardInput {
  readonly number: string;
  readonly cvc: string;
  /** Two digits, e.g. `08`. */
  readonly expMonth: string;
  /** Two digits, e.g. `29`. */
  readonly expYear: string;
  readonly holderName: string;
}

export interface CardToken {
  readonly token: string;
  readonly brand: string;
  readonly lastFour: string;
  /** Epoch milliseconds after which the gateway no longer accepts the token (I-18). */
  readonly expiresAt: number;
}

/** Port of the gateway tokenization: the card number only ever travels to the gateway (ADR-002). */
export interface CardTokenizer {
  tokenize(card: CardInput): ApiResult<CardToken>;
}
