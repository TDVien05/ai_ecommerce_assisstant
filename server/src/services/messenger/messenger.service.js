import * as customerRepo from '../../repositories/messenger/customer.repository.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import * as messageRepo from '../../repositories/messenger/message.repository.js'
import { onEvent } from '../webhook/webhook.service.js'
import { checkBotReply } from './gate.service.js'
import { answerCustomer } from './bot.service.js'
import { logger } from '../../lib/logger.js'

/**
 * Stores customer Messenger activity in the database.
 *
 * This is the real answer to "get the customer's messages": Meta pushes every new message to
 * /webhooks/messenger, so there is no polling and no Page token needed. The Graph API
 * (messenger.history.service.js) is only for backfilling history once.
 *
 * One handler per event type, registered from app.js so importing a module never wires it twice.
 */

const firstMessaging = (payload) => payload?.entry?.[0]?.messaging?.[0] ?? null

/** Text of an incoming Messenger message. Attachments are named so the transcript is not empty. */
export function messageText(event) {
  const text = event?.message?.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  const attachment = event?.message?.attachments?.[0]
  if (attachment) return `[${attachment.type ?? 'attachment'}] ${attachment.payload?.url ?? ''}`.trim()
  return null
}

/** Postbacks carry a title in the button the customer pressed, not in `message`. */
export function postbackText(event) {
  const title = event?.postback?.title
  const payload = event?.postback?.payload
  if (title) return title
  return payload ? `[postback] ${payload}` : null
}

/**
 * Save one customer event. Creates the customer + conversation on first contact.
 * `mid` makes this idempotent: Meta retries and our own replays both collapse into one row.
 */
export async function saveInbound({ shopId, psid, mid, text, createdAt = null, db }) {
  if (!shopId || !psid) return null
  const customer = await customerRepo.upsertByPsid(shopId, { psid }, db)
  const conversation = await conversationRepo.ensureForCustomer(shopId, customer.id, db)
  return messageRepo.createAt(
    shopId,
    { conversationId: conversation.id, mid, role: 'user', content: text, createdAt },
    db,
  )
}

/**
 * Handler body, exported so a test can call it without the webhook pipe.
 *
 * The message is always stored first. Then `checkBotReply` decides whether the bot may answer
 * (paused conversation, exhausted quota), and only if it may does `answerCustomer` run the model
 * and send one reply.
 *
 * The reply is awaited rather than fired in the background: the webhook already answered Meta
 * with 200 before this handler runs (defer), so nothing is waiting on us, and a failure here is
 * visible in the event status instead of the void.
 */
export async function handleMessengerEvent({ eventId, shopId, externalId, payload }) {
  const event = firstMessaging(payload)
  if (!event) return null

  const psid = event.sender?.id
  // `mid` when present; the controller falls back to `<psid>:<timestamp>` for postbacks.
  const mid = event.message?.mid ?? externalId
  const text = event.message ? messageText(event) : postbackText(event)
  if (!text) return null

  const saved = await saveInbound({ shopId, psid, mid, text })

  // Decide here, before any AI work: a paused conversation or an exhausted quota costs nothing.
  const gate = await checkBotReply(shopId, psid)
  if (!gate.reply) {
    logger.info(
      { eventId, shopId, mid, reason: gate.reason, stored: Boolean(saved) },
      'bot will not reply',
    )
    return { saved, gate, reply: null }
  }

  let reply = null
  try {
    reply = await answerCustomer({
      shopId,
      psid,
      conversationId: gate.conversationId,
      inboundMid: mid,
      reservation: gate.reservation,
    })
  } catch (error) {
    // The quota must not leak when the turn dies unexpectedly.
    gate.reservation?.refund()
    logger.error({ err: error, eventId, shopId, mid }, 'bot reply failed')
    return { saved, gate, reply: null, error: error.message }
  }

  logger.info(
    { eventId, shopId, mid, saved: Boolean(saved), replied: reply.replied },
    'messenger event handled',
  )
  return { saved, gate, reply }
}

/**
 * Register the two Messenger handlers. Called once from app.js.
 * Returns an unsubscribe function so tests can clean up.
 */
export function registerMessengerHandlers() {
  const offMessage = onEvent('messenger.message', handleMessengerEvent)
  const offPostback = onEvent('messenger.postback', handleMessengerEvent)
  return () => {
    offMessage()
    offPostback()
  }
}
