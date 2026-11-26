import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  // Never log tokens, secrets, API keys or full customer phone/address.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-hub-signature-256"]',
      'req.query["hub.verify_token"]',
      '*.access_token',
      '*.token',
      '*.password',
      '*.phone',
      '*.address',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
})
