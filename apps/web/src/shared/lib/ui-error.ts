import { type ApiError } from '../api/ports';
import { es } from '../i18n/es';

/** What the UI shows: a stable code plus a Spanish message. */
export interface UiError {
  readonly code: string;
  readonly message: string;
}

const hasMessage = (code: string): code is keyof typeof es.errors => code in es.errors;

export const toUiError = (error: Pick<ApiError, 'code'>): UiError => ({
  code: error.code,
  message: hasMessage(error.code) ? es.errors[error.code] : es.errors.generic,
});
