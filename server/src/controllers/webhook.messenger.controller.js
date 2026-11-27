import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// GET /webhooks/messenger — Meta verification handshake.
export const verify = (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (env.FB_VERIFY_TOKEN && mode === 'subscribe' && token === env.FB_VERIFY_TOKEN) {
    return res.status(200).type('text/plain').send(String(challenge ?? ''))
  }
  res.sendStatus(403)
}

// POST /webhooks/messenger — signature already verified by the route's middleware.
export const receive = (req, res) => {
  // Ack immediately; processing happens asynchronously (docs/ARCHITECTURE.md, flow 1).
  res.sendStatus(200)

  // TODO(M1): hand off to messenger.service (dedupe by mid, skip echo/delivery/read, store, reply).
  const count = req.body?.entry?.reduce((n, e) => n + (e.messaging?.length ?? 0), 0) ?? 0
  logger.debug({ object: req.body?.object, events: count }, 'messenger webhook received')
}
