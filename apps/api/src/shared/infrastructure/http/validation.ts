import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { type FieldError } from '../../kernel/domain-error';
import { DomainErrorException } from './domain-error.exception';

/** Flattens nested class-validator errors into `field.path: message` pairs. */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parent = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/** Unknown properties are rejected (not silently dropped) and errors become VALIDATION_ERROR. */
export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new DomainErrorException({
        code: 'VALIDATION_ERROR',
        details: flattenValidationErrors(errors),
      }),
  });
