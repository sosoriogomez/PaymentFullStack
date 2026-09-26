export const TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Every status but PENDING is final and immutable. */
export type FinalStatus = Exclude<TransactionStatus, 'PENDING'>;

export const isFinalStatus = (status: TransactionStatus): status is FinalStatus =>
  status !== 'PENDING';
