import pino from 'pino';
import { config } from '../config';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: config.logLevel,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
