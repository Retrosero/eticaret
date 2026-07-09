/**
 * Yapısal loglama — pino sarmalayıcısı.
 *
 * JSON üretir; tüm loglarda ortak alanlar:
 *  - service: servis adı
 *  - env: ortam
 *  - version: uygulama sürümü
 *  - correlationId / requestId: dağıtık izleme
 *
 * Üretimde yalnızca JSON satırı; geliştirmede renkli pretty-print.
 *
 * @module logger
 */

import { pino, type LoggerOptions, type Logger as PinoLogger } from 'pino';

export interface CreateLoggerOptions {
  service: string;
  version?: string;
  env?: string;
  level?: string;
  /** Pretty-print (yalnızca geliştirmede önerilir). */
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): PinoLogger {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const config: LoggerOptions = {
    name: options.service,
    level: options.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: {
      service: options.service,
      version: options.version ?? process.env['APP_VERSION'] ?? '0.1.0',
      env: options.env ?? process.env['NODE_ENV'] ?? 'development',
      pid: process.pid,
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    // Üretimde yığın izi JSON'a dahil etme — istemciye sızdırma riski
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'token',
        'secret',
        '*.email',
        '*.phone',
        '*.tckn',
        'kvkk.*',
      ],
      censor: '[REDACTED]',
    },
  };

  if (!isProduction && (options.pretty ?? true)) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,version',
      },
    };
  }

  return pino(config);
}

export type Logger = PinoLogger;
