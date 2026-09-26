export class PaymentEventReceipt {
  /** Always true: every authentic event is acknowledged, duplicates included. */
  readonly received!: true;
}
