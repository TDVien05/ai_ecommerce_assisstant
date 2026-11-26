import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { forbidden, HttpError } from '../lib/httpError.js'

/**
 * Verify X-Hub-Signature-256 (HMAC-SHA256 of the RAW body, key = FB_APP_SECRET).
 * Must run after express.raw() and before any JSON parsing.
 * On success, req.body is replaced with the parsed JSON payload.
 */
export const verifyFbSignature = (req, _res, next) => {
  if (!env.FB_APP_SECRET) throw new HttpError(503, 'NOT_CONFIGURED', 'Messenger webhook is not configured')

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const received = Buffer.from(req.get('x-hub-signature-256') ?? '')
  const expected = Buffer.from(
    'sha256=' + crypto.createHmac('sha256', env.FB_APP_SECRET).update(raw).digest('hex'),
  )

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw forbidden('Invalid signature')
  }

  try {
    req.body = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Malformed JSON body')
  }
  next()
}
