import { type RootState } from '@/app/hooks';

export const selectTransactionState = (state: RootState) => state.transaction;
export const selectCurrentTransaction = (state: RootState) => state.transaction.current;
