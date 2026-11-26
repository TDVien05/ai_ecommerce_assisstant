import express, { Router } from 'express'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { verifyFbSignature } from '../middlewares/verifyFbSignature.js'

export const messengerWebhookRouter = Router()

// GET /webhooks/messenger — Meta verification handshake.
messengerWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (env.FB_VERIFY_TOKEN && mode === 'subscribe' && token === env.FB_VERIFY_TOKEN) {
    return res.status(200).type('text/plain').send(String(challenge ?? ''))
  }
  res.sendStatus(403)
})

// POST /webhooks/messenger — raw body is kept so the signature is verified BEFORE parsing.
messengerWebhookRouter.post(
  '/',
  express.raw({ type: '*/*', limit: '1mb' }),
  verifyFbSignature,
  (req, res) => {
    // Ack immediately; processing happens asynchronously (docs/ARCHITECTURE.md, flow 1).
    res.sendStatus(200)

    // TODO(M1): hand off to messenger.service (dedupe by mid, skip echo/delivery/read, store, reply).
    const count = req.body?.entry?.reduce((n, e) => n + (e.messaging?.length ?? 0), 0) ?? 0
    logger.debug({ object: req.body?.object, events: count }, 'messenger webhook received')
  },
)
