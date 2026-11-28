import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { appError, unauthorized } from '../errors/index.js'

/** Verify `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>` with a constant-time compare. */
export const verifySepayKey = (req, _res, next) => {
  if (!env.SEPAY_WEBHOOK_API_KEY) throw appError('NOT_CONFIGURED', 'SePay webhook is not configured')

  const received = Buffer.from(req.get('authorization') ?? '')
  const expected = Buffer.from(`Apikey ${env.SEPAY_WEBHOOK_API_KEY}`)

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw unauthorized('Invalid API key')
  }
  next()
}
