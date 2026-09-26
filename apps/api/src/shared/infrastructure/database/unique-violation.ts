import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  readonly code?: string;
  readonly constraint?: string;
}

/** True when Postgres rejected the statement because of the given UNIQUE constraint. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as PostgresDriverError;
  return driverError.code === UNIQUE_VIOLATION && driverError.constraint === constraint;
}
