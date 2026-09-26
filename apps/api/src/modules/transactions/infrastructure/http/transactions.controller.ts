import { Body, Controller, Get, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { type Response } from 'express';
import {
  IDEMPOTENT_REPLAYED_HEADER,
  IdempotencyKey,
} from '../../../../shared/infrastructure/http/idempotency-key';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { CreateTransaction } from '../../application/create-transaction.use-case';
import { FindTransactionByIdempotencyKey } from '../../application/find-transaction-by-idempotency-key.use-case';
import { GetTransaction } from '../../application/get-transaction.use-case';
import {
  CreateTransactionRequest,
  FindTransactionQuery,
  toCreateTransactionCommand,
} from './create-transaction.request';
import { TransactionResponse } from './transaction.response';

@Controller({ path: 'transactions', version: '1' })
export class TransactionsController {
  constructor(
    private readonly createTransaction: CreateTransaction,
    private readonly findByIdempotencyKey: FindTransactionByIdempotencyKey,
    private readonly getTransaction: GetTransaction,
  ) {}

  /**
   * 201 when created (even if the payment failed: the resource exists in ERROR); 200 with
   * `Idempotent-Replayed` when the key was already used for the same purchase (I-05).
   */
  @Post()
  async create(
    @IdempotencyKey() idempotencyKey: string,
    @Body() body: CreateTransactionRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TransactionResponse> {
    const { kind, view } = unwrapOrThrow(
      await this.createTransaction.execute(toCreateTransactionCommand(idempotencyKey, body)),
    );
    response
      .status(kind === 'created' ? HttpStatus.CREATED : HttpStatus.OK)
      .location(`/api/v1/transactions/${view.transaction.id}`);
    if (kind === 'replayed') response.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    return TransactionResponse.from(view);
  }

  /** `?idempotencyKey=`: recovery after a refresh while the POST was in flight (C-04). */
  @Get()
  async findByKey(@Query() query: FindTransactionQuery): Promise<TransactionResponse> {
    const view = unwrapOrThrow(
      await this.findByIdempotencyKey.execute(query.idempotencyKey.toLowerCase()),
    );
    return TransactionResponse.from(view);
  }

  /** Status of a transaction; a PENDING one is synced with the gateway first (polling). */
  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<TransactionResponse> {
    return TransactionResponse.from(unwrapOrThrow(await this.getTransaction.execute(id)));
  }
}
