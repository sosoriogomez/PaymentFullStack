import { createAppAsyncThunk } from '@/app/hooks';
import { type Product } from '@/shared/api/contracts';
import { toUiError } from '@/shared/lib/ui-error';

export const fetchProducts = createAppAsyncThunk<Product[]>(
  'catalog/fetchProducts',
  async (_arg, { extra, rejectWithValue }) => {
    const result = await extra.api.listProducts();
    return result.ok ? result.value : rejectWithValue(toUiError(result.error));
  },
);

/** Step 5: reads the fresh stock of the purchased product right after the purchase. */
export const refreshProductStock = createAppAsyncThunk<
  { productId: string; available: number },
  string
>('catalog/refreshProductStock', async (productId, { extra, rejectWithValue }) => {
  const result = await extra.api.getProductStock(productId);
  return result.ok
    ? { productId, available: result.value.available }
    : rejectWithValue(toUiError(result.error));
});
