import express, { Router } from 'express'
import * as sepayController from '../../controllers/webhook/sepay.controller.js'
import { verifySepayKey } from '../../middlewares/verifySepayKey.js'
import { verifySepaySignature } from '../../middlewares/verifySepaySignature.js'
import { env } from '../../config/env.js'

export const sepayWebhookRouter = Router()

/**
 * Model A (multi-shop): every shop connects its own gateway account, so every shop has its own
 * webhook secret. The shop id is part of the URL, which lets us resolve the right secret BEFORE
 * verifying the signature.
 *
 *   POST /webhooks/sepay/:shopId   → HMAC-SHA256 with that shop's secret
 *
 * The legacy single-shop route stays for installs that have not migrated:
 *
 *   POST /webhooks/sepay           → global SEPAY_WEBHOOK_SECRET, or the API key
 *
 * The raw body is required for HMAC (SePay signs the exact bytes), so express.raw() must run
 * before any JSON parsing.
 */
const rawBody = express.raw({ type: '*/*', limit: '100kb' })

// Per-shop: always HMAC. A shop with no secret gets 503, which is a clear setup error.
sepayWebhookRouter.post('/:shopId', rawBody, verifySepaySignature, sepayController.receive)

// Legacy single-shop route.
const verifyLegacy = env.SEPAY_WEBHOOK_SECRET
  ? [rawBody, verifySepaySignature]
  : [verifySepayKey, express.json({ limit: '100kb' })]

sepayWebhookRouter.post('/', ...verifyLegacy, sepayController.receive)
