import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import { loggerParams } from './logger.config';

@Module({
  imports: [LoggerModule.forRootAsync({ inject: [AppConfigService], useFactory: loggerParams })],
})
export class LoggingModule {}
