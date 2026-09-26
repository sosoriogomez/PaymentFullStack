import { type DatabaseSettings } from '../../../src/shared/infrastructure/config/app-config.service';

export const databaseSettings = (url: string): DatabaseSettings => ({
  url,
  host: undefined,
  port: 5432,
  name: undefined,
  user: undefined,
  password: undefined,
  sslCaPath: undefined,
  poolMax: 2,
});
