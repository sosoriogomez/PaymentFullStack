import { type DomainError } from '../../../shared/kernel/domain-error';
import { Money } from '../../../shared/kernel/money';
import { andThen, map, type Result } from '../../../shared/kernel/result';
import { type FeePolicy, type Fees } from '../domain/fee-policy.port';

export interface FlatFeeSettings {
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly currency: string;
}

/** Same base fee and delivery fee for every order (values from configuration). */
export class FlatFeePolicy implements FeePolicy {
  constructor(private readonly settings: FlatFeeSettings) {}

  feesFor(): Result<Fees, DomainError> {
    const { baseFeeInCents, deliveryFeeInCents, currency } = this.settings;
    return andThen(Money.of(baseFeeInCents, currency), (baseFee) =>
      map(Money.of(deliveryFeeInCents, currency), (deliveryFee) => ({ baseFee, deliveryFee })),
    );
  }
}
