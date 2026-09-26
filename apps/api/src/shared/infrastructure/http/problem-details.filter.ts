import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { DomainErrorException } from './domain-error.exception';
import { type ProblemMapping, toProblem } from './domain-error.http-mapper';

interface ProblemResponse extends ProblemMapping {
  readonly code: string;
}

/** Errors thrown by body-parser and friends follow the http-errors convention. */
interface ExposedHttpError {
  readonly status: number;
  readonly expose: true;
  readonly message: string;
}

const isExposedHttpError = (value: unknown): value is ExposedHttpError =>
  typeof value === 'object' &&
  value !== null &&
  (value as Partial<ExposedHttpError>).expose === true &&
  typeof (value as Partial<ExposedHttpError>).status === 'number';

const codeForStatus = (status: number): string =>
  (STATUS_CODES[status] ?? 'Error').toUpperCase().replace(/[^A-Z0-9]+/g, '_');

const INTERNAL_ERROR: ProblemResponse = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  detail: 'An unexpected error occurred',
};

/** Every error leaves the API as `application/problem+json` (RFC 9457), never with a stack trace. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = this.toProblemResponse(exception);

    if (problem.status >= 500) this.logger.error(exception);
    response
      .status(problem.status)
      .set(problem.headers ?? {})
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: STATUS_CODES[problem.status] ?? 'Error',
        status: problem.status,
        code: problem.code,
        detail: problem.detail,
        instance: request.originalUrl.split('?')[0],
        requestId: request.id,
        ...problem.extensions,
      });
  }

  private toProblemResponse(exception: unknown): ProblemResponse {
    if (exception instanceof DomainErrorException) {
      return { ...toProblem(exception.error), code: exception.error.code };
    }
    if (exception instanceof HttpException) return this.fromHttpException(exception);
    if (isExposedHttpError(exception) && exception.status < 500) {
      return {
        status: exception.status,
        code: codeForStatus(exception.status),
        detail: exception.message,
      };
    }
    return INTERNAL_ERROR;
  }

  /** 4xx messages are meant for the client; 5xx keep their status but never their message. */
  private fromHttpException(exception: HttpException): ProblemResponse {
    const status = exception.getStatus();
    const detail = status >= 500 ? INTERNAL_ERROR.detail : exception.message;
    return { status, code: codeForStatus(status), detail };
  }
}
