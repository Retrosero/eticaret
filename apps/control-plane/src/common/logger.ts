/**
 * NestJS Provider'ı — ortak pino logger.
 */

import { Provider } from '@nestjs/common';
import { createLogger, type Logger } from '@eticart/config';

export const LOGGER_TOKEN = Symbol.for('@eticart/control-plane/LOGGER');

export const loggerProvider: Provider = {
  provide: LOGGER_TOKEN,
  useFactory: (): Logger =>
    createLogger({
      service: 'control-plane',
      version: process.env['APP_VERSION'] ?? '0.1.0',
    }),
};

export { LOGGER_TOKEN as Logger };
