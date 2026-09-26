import { es } from '../i18n/es';
import { toUiError } from './ui-error';

describe('toUiError', () => {
  it('should translate known codes', () => {
    expect(toUiError({ code: 'INSUFFICIENT_STOCK' })).toEqual({
      code: 'INSUFFICIENT_STOCK',
      message: es.errors.INSUFFICIENT_STOCK,
    });
  });

  it('should fall back to a generic message for unknown codes', () => {
    expect(toUiError({ code: 'SOMETHING_NEW' })).toEqual({
      code: 'SOMETHING_NEW',
      message: es.errors.generic,
    });
  });
});
