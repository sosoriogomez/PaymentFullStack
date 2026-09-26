import { createAppAsyncThunk, type AppThunk } from '@/app/hooks';
import { fetchProducts, refreshProductStock } from '@/features/catalog/catalog.thunks';
import { checkoutReset } from '@/features/checkout/checkout.actions';
import { type Delivery, type Transaction } from '@/shared/api/contracts';
import { toUiError } from '@/shared/lib/ui-error';

/** By id: deep link without saved state (I-10) and "Consultar de nuevo". */
export const fetchTransaction = createAppAsyncThunk<Transaction, string>(
  'transaction/fetchTransaction',
  async (transactionId, { extra, rejectWithValue }) => {
    const result = await extra.api.getTransaction(transactionId);
    return result.ok ? result.value : rejectWithValue(toUiError(result.error));
  },
);

export const fetchDelivery = createAppAsyncThunk<Delivery, string>(
  'transaction/fetchDelivery',
  async (deliveryId, { extra, rejectWithValue }) => {
    const result = await extra.api.getDelivery(deliveryId);
    return result.ok ? result.value : rejectWithValue(toUiError(result.error));
  },
);

/**
 * Step 5: forget the checkout and show the catalog with the stock updated right away (the
 * purchased product is read again through the `stock` resource).
 */
export const returnToStore = (): AppThunk => (dispatch, getState) => {
  const productId = getState().transaction.current?.product.id;
  dispatch(checkoutReset());
  void dispatch(fetchProducts());
  if (productId) void dispatch(refreshProductStock(productId));
};
