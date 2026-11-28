import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { HttpError, forbidden } from '../lib/httpError.js'
import { recordSignatureFailure } from '../services/fraud.service.js'

/**
 * Verify `X-Sim-Signature: sha256=<hex>` (HMAC-SHA256 of the RAW body, key = SIM_WEBHOOK_SECRET)
 * for the in-app simulator. Same shape as the Messenger check so both pipes behave alike.
 * A failed check is recorded as a HIGH fraud check (metadata only, never the body) and the
 * request never reaches a handler.
 */
export const verifySimSignature = async (req, _res, next) => {
  if (!env.SIM_WEBHOOK_SECRET) throw new HttpError(503, 'NOT_CONFIGURED', 'Simulator webhook is not configured')

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const received = Buffer.from(req.get('x-sim-signature') ?? '')
  const expected = Buffer.from(
    'sha256=' + crypto.createHmac('sha256', env.SIM_WEBHOOK_SECRET).update(raw).digest('hex'),
  )

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    await recordSignatureFailure({
      provider: 'sim',
      reason: 'Sai chữ ký HMAC trên /webhooks/sim.',
      metadata: { ip: req.ip, contentLength: raw.length },
    })
    throw forbidden('Invalid signature')
  }

  try {
    req.body = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Malformed JSON body')
  }
  next()
}
