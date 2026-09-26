import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Product } from '@/shared/api/contracts';
import { type UiError } from '@/shared/lib/ui-error';

export type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface CatalogState {
  readonly items: Product[];
  readonly status: LoadStatus;
  readonly error: UiError | null;
}

export const initialCatalogState: CatalogState = { items: [], status: 'idle', error: null };

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: initialCatalogState,
  reducers: {
    productsRequested(state) {
      state.status = 'loading';
      state.error = null;
    },
    productsLoaded(state, action: PayloadAction<Product[]>) {
      state.items = action.payload;
      state.status = 'succeeded';
    },
    productsFailed(state, action: PayloadAction<UiError>) {
      state.status = 'failed';
      state.error = action.payload;
    },
    productStockUpdated(state, action: PayloadAction<{ productId: string; available: number }>) {
      const product = state.items.find((item) => item.id === action.payload.productId);
      if (product) product.stock = action.payload.available;
    },
  },
});

export const { productsRequested, productsLoaded, productsFailed, productStockUpdated } =
  catalogSlice.actions;
