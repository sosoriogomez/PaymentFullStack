import { Global, Module } from '@nestjs/common';
import { CLOCK, HASHER, ID_GENERATOR } from '../../kernel/ports';
import { CryptoIdGenerator, Sha256Hasher, SystemClock } from './kernel-adapters';

/** Adapters of the kernel ports, available to every module. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: CryptoIdGenerator },
    { provide: HASHER, useClass: Sha256Hasher },
  ],
  exports: [CLOCK, ID_GENERATOR, HASHER],
})
export class KernelModule {}
