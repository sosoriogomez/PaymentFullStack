import { type Result } from '../../../shared/kernel/result';
import {
  type AcceptanceTokens,
  type GatewayError,
  type PaymentGateway,
} from '../../payment-gateway/domain/payment-gateway.port';

/** Terms the customer must accept (with links to read them) before paying. */
export class GetAcceptance {
  constructor(private readonly gateway: PaymentGateway) {}

  execute(): Promise<Result<AcceptanceTokens, GatewayError>> {
    return this.gateway.getAcceptanceTokens();
  }
}
