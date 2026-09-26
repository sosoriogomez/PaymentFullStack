import { ParseUUIDPipe } from '@nestjs/common';
import { validationError } from '../../kernel/domain-error';
import { DomainErrorException } from './domain-error.exception';

/** Path ids are UUID v4 (not enumerable, OWASP API1); anything else is a VALIDATION_ERROR. */
export const uuidParam = (field: string): ParseUUIDPipe =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new DomainErrorException(validationError(field, 'must be a UUID v4')),
  });
