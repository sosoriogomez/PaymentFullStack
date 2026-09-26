import { createAsyncThunk, type TypedStartListening } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { type UiError } from '@/shared/lib/ui-error';
import { type AppServices } from './services';
import { type AppDispatch, type RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  extra: AppServices;
  rejectValue: UiError;
}>();

export type AppStartListening = TypedStartListening<RootState, AppDispatch, AppServices>;
export type { AppServices, AppDispatch, RootState };
