import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_QUANTITY_PER_ORDER } from '../../../checkout/domain/quantity';
import { type CreateTransactionCommand } from '../../application/create-transaction.use-case';
import { MAX_INSTALLMENTS } from '../../domain/installments';
import { DELIVERY_COUNTRIES } from '../../domain/shipping-address';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Card and acceptance tokens are opaque; the limit only stops oversized payloads. */
const MAX_TOKEN_LENGTH = 4096;

export class DeliveryRequest {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  @Matches(/^\p{L}[\p{L} .'-]*$/u, { message: 'recipientName must only contain letters' })
  readonly recipientName!: string;

  @Transform(trim)
  @Matches(/^3\d{9}$/, {
    message: 'recipientPhone must be a Colombian mobile number (10 digits starting with 3)',
  })
  readonly recipientPhone!: string;

  @Transform(trim)
  @IsString()
  @Length(3, 120)
  readonly addressLine1!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  readonly addressLine2?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  readonly city!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  readonly region!: string;

  @IsIn(DELIVERY_COUNTRIES)
  readonly country!: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'postalCode must have 6 digits' })
  readonly postalCode?: string;
}

export class PaymentRequest {
  @IsString()
  @Length(1, MAX_TOKEN_LENGTH)
  readonly cardToken!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_INSTALLMENTS)
  readonly installments!: number;

  @IsString()
  @Length(1, MAX_TOKEN_LENGTH)
  readonly acceptanceToken!: string;

  @IsString()
  @Length(1, MAX_TOKEN_LENGTH)
  readonly acceptPersonalAuth!: string;
}

/** The client never sends amounts: the API prices the order (spec §4.4). */
export class CreateTransactionRequest {
  @IsUUID('4')
  readonly productId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ORDER)
  readonly quantity!: number;

  @IsUUID('4')
  readonly customerId!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryRequest)
  readonly delivery!: DeliveryRequest;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentRequest)
  readonly payment!: PaymentRequest;
}

export class FindTransactionQuery {
  @IsUUID('4')
  readonly idempotencyKey!: string;
}

export const toCreateTransactionCommand = (
  idempotencyKey: string,
  body: CreateTransactionRequest,
): CreateTransactionCommand => ({
  idempotencyKey,
  productId: body.productId,
  quantity: body.quantity,
  customerId: body.customerId,
  delivery: body.delivery,
  payment: body.payment,
});
