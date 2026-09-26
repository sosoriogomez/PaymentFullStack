import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Product } from '@/shared/api/contracts';
import { type LoadStatus } from '@/shared/lib/load-status';
import { type UiError } from '@/shared/lib/ui-error';
import { fetchProducts, refreshProductStock } from './catalog.thunks';

export type { LoadStatus };

export interface CatalogState {
  readonly items: Product[];
  readonly status: LoadStatus;
  readonly error: UiError | null;
}

export const initialCatalogState: CatalogState = { items: [], status: 'idle', error: null };

const updateStock = (state: CatalogState, productId: string, available: number) => {
  const product = state.items.find((item) => item.id === productId);
  if (product) product.stock = available;
};

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: initialCatalogState,
  reducers: {
    productStockUpdated(state, action: PayloadAction<{ productId: string; available: number }>) {
      updateStock(state, action.payload.productId, action.payload.available);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? { code: 'UNKNOWN', message: action.error.message ?? '' };
      })
      .addCase(refreshProductStock.fulfilled, (state, action) => {
        updateStock(state, action.payload.productId, action.payload.available);
      });
  },
});

export const { productStockUpdated } = catalogSlice.actions;
