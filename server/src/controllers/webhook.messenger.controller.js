import { env } from '../config/env.js'
import { ingest } from '../services/webhook.service.js'
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
// Ack immediately (Meta retries on timeouts) and hand every messaging event to the pipe.
export const receive = (req, res) => {
  res.sendStatus(200)

  const body = req.body ?? {}
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      // Echoes of what the Page itself sent are not customer intent.
      if (event.message?.is_echo) continue
      const type = event.message ? 'messenger.message' : event.postback ? 'messenger.postback' : null
      if (!type) continue // delivery / read / optin events are ignored

      const externalId = event.message?.mid ?? `${event.sender?.id}:${event.timestamp}`
      const payload = { object: body.object, entry: [{ id: entry.id, time: entry.time, messaging: [event] }] }

      ingest({ provider: 'messenger', externalId, type, payload, defer: true }).catch((err) => {
        logger.error({ err, externalId, type }, 'could not store messenger event')
      })
    }
  }
}
