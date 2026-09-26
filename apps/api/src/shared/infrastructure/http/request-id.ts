import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reuses the caller's `x-request-id` when it is a UUID (never trusts arbitrary text in logs),
 * otherwise generates one, and echoes it in the response.
 */
export function resolveRequestId(
  req: IncomingMessage,
  res: ServerResponse,
  generate: () => string = randomUUID,
): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && UUID_PATTERN.test(incoming) ? incoming : generate();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
