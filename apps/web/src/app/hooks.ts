import {
  createAsyncThunk,
  type ThunkAction,
  type TypedStartListening,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { type UiError } from '@/shared/lib/ui-error';
// `import type` is fully erased: no runtime cycle hooks → store → slices → thunks → hooks.
import type { AppServices } from './services';
import type { AppDispatch, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  extra: AppServices;
  rejectValue: UiError;
}>();

export type AppStartListening = TypedStartListening<RootState, AppDispatch, AppServices>;

/** Hand-written thunk: used when the argument must not travel in any action (card data). */
export type AppThunk<R = void> = ThunkAction<R, RootState, AppServices, UnknownAction>;
export type { AppServices, AppDispatch, RootState };
