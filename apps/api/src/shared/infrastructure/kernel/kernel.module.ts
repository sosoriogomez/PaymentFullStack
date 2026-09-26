import { Global, Module } from '@nestjs/common';
import { ALERT_LOG, CLOCK, HASHER, ID_GENERATOR } from '../../kernel/ports';
import { CryptoIdGenerator, LoggerAlertLog, Sha256Hasher, SystemClock } from './kernel-adapters';

/** Adapters of the kernel ports, available to every module. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: CryptoIdGenerator },
    { provide: HASHER, useClass: Sha256Hasher },
    { provide: ALERT_LOG, useClass: LoggerAlertLog },
  ],
  exports: [CLOCK, ID_GENERATOR, HASHER, ALERT_LOG],
})
export class KernelModule {}
