import express, { Router } from 'express'
import { HttpError } from '../lib/httpError.js'
import { verifySepayKey } from '../middlewares/verifySepayKey.js'

export const sepayWebhookRouter = Router()

// POST /webhooks/sepay — API key is checked before the body is parsed.
sepayWebhookRouter.post('/', verifySepayKey, express.json({ limit: '100kb' }), () => {
  // TODO(M4): payment.service, following docs/PAYMENT_ANTI_SCAM.md.
  // Deliberately NOT returning 200 yet: a 2xx would tell SePay the transaction was handled.
  throw new HttpError(501, 'NOT_IMPLEMENTED', 'SePay webhook handling is not implemented yet')
})
