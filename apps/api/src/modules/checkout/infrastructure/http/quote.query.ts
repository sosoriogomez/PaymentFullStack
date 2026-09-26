import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_QUANTITY_PER_ORDER } from '../../domain/quantity';

export class QuoteQuery {
  @IsUUID('4')
  readonly productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ORDER)
  readonly quantity!: number;
}
