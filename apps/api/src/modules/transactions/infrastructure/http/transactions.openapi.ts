import { applyDecorators } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../shared/infrastructure/http/idempotency-key';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { TransactionResponse } from './transaction.response';

/** OpenAPI of POST /transactions (kept apart so the controller reads as the flow it is). */
export const ApiCreateTransaction = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Creates the transaction (PENDING) and charges it once',
      description:
        'The API prices the order: amounts are never sent. A gateway rejection answers 201 ' +
        'with status ERROR; a gateway timeout answers 201 PENDING, resolved later by polling ' +
        'or by the reconciliation.',
    }),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description: 'UUID v4 per purchase attempt; reused when the card is entered again (ADR-006)',
    }),
    ApiCreatedResponse({ type: TransactionResponse, description: 'Created (Location header)' }),
    ApiOkResponse({
      type: TransactionResponse,
      description: 'Idempotent replay of the same purchase (Idempotent-Replayed: true)',
    }),
    ApiProblems(400, 404, 409, 413, 422),
  );
