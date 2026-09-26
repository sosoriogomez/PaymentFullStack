import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/app/hooks';

export const selectCatalog = (state: RootState) => state.catalog;
export const selectProducts = (state: RootState) => state.catalog.items;
export const selectCatalogStatus = (state: RootState) => state.catalog.status;
export const selectCatalogError = (state: RootState) => state.catalog.error;

export const selectProductById = createSelector(
  [selectProducts, (_state: RootState, productId: string | null) => productId],
  (products, productId) => products.find((product) => product.id === productId) ?? null,
);
