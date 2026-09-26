import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

/** RFC 9457 body of every error; clients branch on `code`, not on the text (I-04). */
export class ProblemDetails {
  @ApiProperty({ example: 'about:blank' })
  readonly type!: string;

  @ApiProperty({ example: 'Conflict', description: 'Reason phrase of the HTTP status' })
  readonly title!: string;

  @ApiProperty({ example: 409 })
  readonly status!: number;

  @ApiProperty({ example: 'INSUFFICIENT_STOCK', description: 'Stable, machine readable code' })
  readonly code!: string;

  @ApiProperty({ example: 'Only 2 units available' })
  readonly detail!: string;

  @ApiProperty({ example: '/api/v1/transactions' })
  readonly instance!: string;

  @ApiProperty({ example: '0f8c1d7e-6a0b-4c2e-9d6f-3b1a2c4d5e6f' })
  readonly requestId!: string;

  @ApiPropertyOptional({
    description: 'VALIDATION_ERROR only: one entry per invalid field',
    example: [{ field: 'delivery.country', message: 'country must be one of: CO' }],
  })
  readonly details?: { field: string; message: string }[];
}

const PROBLEMS = {
  400: 'VALIDATION_ERROR: invalid body, query, path or header',
  401: 'INVALID_EVENT_SIGNATURE: the event checksum does not match',
  404: 'PRODUCT_NOT_FOUND | CUSTOMER_NOT_FOUND | TRANSACTION_NOT_FOUND | DELIVERY_NOT_FOUND',
  409: 'INSUFFICIENT_STOCK: not enough units',
  413: 'PAYLOAD_TOO_LARGE: body over the limit',
  422: 'IDEMPOTENCY_CONFLICT: the key was used for another purchase',
  429: 'TOO_MANY_REQUESTS: rate limit per client IP (see Retry-After)',
  502: 'GATEWAY_REJECTED: the payment gateway rejected the operation',
  503: 'GATEWAY_UNAVAILABLE: the payment gateway did not answer (see Retry-After)',
} as const;

/** Documents the problem responses a route can answer, as application/problem+json. */
export const ApiProblems = (...statuses: (keyof typeof PROBLEMS)[]) =>
  applyDecorators(
    ApiExtraModels(ProblemDetails),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: PROBLEMS[status],
        content: {
          'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetails) } },
        },
      }),
    ),
  );
