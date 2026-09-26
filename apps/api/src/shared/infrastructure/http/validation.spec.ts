import { type ValidationError } from '@nestjs/common';
import { flattenValidationErrors } from './validation';

const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
) => ({ property, constraints, children }) as ValidationError;

describe('flattenValidationErrors', () => {
  it('should list every constraint of every field with its dotted path', () => {
    const errors = [
      error('quantity', {
        min: 'quantity must not be less than 1',
        isInt: 'quantity must be an integer',
      }),
      {
        property: 'delivery',
        children: [error('city', { length: 'city is too short' })],
      } as ValidationError,
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'quantity', message: 'quantity must not be less than 1' },
      { field: 'quantity', message: 'quantity must be an integer' },
      { field: 'delivery.city', message: 'city is too short' },
    ]);
  });

  it('should return an empty list when there are no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
