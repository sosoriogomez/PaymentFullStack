import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Min, ValidateNested } from 'class-validator';
import { unwrapOrThrow } from '../../src/shared/infrastructure/http/unwrap';
import { err } from '../../src/shared/kernel/result';

class ProbeAddress {
  @IsString()
  @Length(3, 20)
  city!: string;
}

export class ProbeBody {
  @IsString()
  @Length(3, 10)
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @ValidateNested()
  @Type(() => ProbeAddress)
  address!: ProbeAddress;
}

/** Test-only routes that exercise the cross-cutting HTTP behavior. */
@Controller({ path: '__probe', version: '1' })
export class ProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2');
  }

  @Get('stock')
  stock(): never {
    return unwrapOrThrow(err({ code: 'INSUFFICIENT_STOCK', available: 2, requested: 5 }));
  }

  @Get('gateway')
  gateway(): never {
    return unwrapOrThrow(err({ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }));
  }

  @Get('teapot')
  teapot(): never {
    throw new HttpException('I refuse to brew coffee', HttpStatus.I_AM_A_TEAPOT);
  }

  @Get('bad-gateway-exception')
  internal(): never {
    throw new HttpException('upstream exploded with secrets', HttpStatus.BAD_GATEWAY);
  }

  @Post('echo')
  echo(@Body() body: ProbeBody): ProbeBody {
    return body;
  }
}
