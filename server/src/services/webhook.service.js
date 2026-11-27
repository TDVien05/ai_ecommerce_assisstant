import { z } from 'zod'
import * as webhookEventsRepo from '../db/repos/webhookEvents.js'
import * as shopsRepo from '../db/repos/shops.js'
import * as ordersRepo from '../db/repos/orders.js'
import * as fraud from './fraud.service.js'
import { badRequest } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'

/**
 * Single intake pipe for everything that arrives from outside:
 * Messenger messages, SePay balance changes and the in-app simulator.
 *
 * Order of work: store the event (unique per provider + external id) → skip duplicates →
 * run the hard fraud rules → hand it to the registered handler.
 * Controllers respond 200 as soon as the event is stored and pass `defer: true`; the
 * processing then runs in setImmediate so a slow handler never blocks the provider.
 */

export const PROVIDERS = ['messenger', 'sepay', 'sim']
export const EVENT_TYPES = ['messenger.message', 'messenger.postback', 'payment.received']

const envelope = z.object({
  provider: z.enum(PROVIDERS),
  externalId: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  payload: z.any(),
})

const handlers = new Map()

/** Register a handler for an event type. Several handlers may listen to the same type. */
export function onEvent(type, handler) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Unknown event type: ${type}`)
  if (typeof handler !== 'function') throw new Error('handler must be a function')
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(handler)
  return () => offEvent(type, handler)
}

export function offEvent(type, handler) {
  handlers.get(type)?.delete(handler)
}

export function listeners(type) {
  return [...(handlers.get(type) ?? [])]
}

/** Tests only: drop every listener, including the logging placeholders below. */
export function resetHandlers() {
  handlers.clear()
}

/**
 * Which shop does this event belong to? Messenger carries the Page id, SePay the receiving
 * account number. When the account is unknown (someone paid the wrong shop, or the account
 * changed) fall back to the payment code on the order. Unknown shops still get processed
 * with `shopId = null` so nothing is written into another tenant's data.
 */
export async function resolveShopId(provider, payload) {
  if (provider === 'messenger') {
    const pageId = payload?.entry?.[0]?.id
    return pageId ? (await shopsRepo.findByPageId(pageId))?.id ?? null : null
  }

  // Payment code first: it is globally unique and points at the exact order, which also makes
  // "paid into the wrong account" attributable (and flaggable) instead of just "unknown shop".
  const code = payload?.code ?? fraud.extractPaymentCode(payload?.content)
  const order = await ordersRepo.findShopByPaymentCode(code)
  if (order) return order.shop_id

  const byAccount = payload?.accountNumber
    ? await shopsRepo.findByBankAccount(payload.accountNumber)
    : null
  if (byAccount) return byAccount.id

  const pageId = payload?.entry?.[0]?.id
  if (pageId) return (await shopsRepo.findByPageId(pageId))?.id ?? null
  return null
}

/**
 * @returns {Promise<{eventId:number, duplicate:boolean, processed?:boolean, ignored?:boolean, failed?:boolean}>}
 */
export async function ingest(input) {
  const parsed = envelope.safeParse(input)
  if (!parsed.success) {
    throw badRequest('Sự kiện không hợp lệ.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  }
  const { provider, externalId, type, payload, defer = false } = { ...parsed.data, defer: input.defer === true }

  const shopId = await resolveShopId(provider, payload)
  const { event, inserted } = await webhookEventsRepo.claim({ provider, externalId, type, shopId, payload })

  if (!inserted) {
    logger.debug({ provider, externalId, type }, 'duplicate webhook event ignored')
    return { eventId: event?.id, duplicate: true }
  }

  if (defer) {
    setImmediate(() => {
      processEvent(event).catch((err) => logger.error({ err, eventId: event.id }, 'webhook processing failed'))
    })
    return { eventId: event.id, duplicate: false }
  }
  return { eventId: event.id, duplicate: false, ...(await processEvent(event)) }
}

/** Fraud check → dispatch. Exported so tests can drive it without the HTTP layer. */
export async function processEvent(event) {
  const { id, shop_id: shopId, provider, external_id: externalId, type, payload } = event

  try {
    const verdict = await fraud.check({ shopId, provider, externalId, type, payload })
    if (verdict.blocked) {
      await webhookEventsRepo.markProcessed(id, 'IGNORED')
      logger.warn({ eventId: id, provider, type, rules: verdict.findings.map((f) => f.rule) }, 'webhook event blocked by fraud rules')
      return { ignored: true }
    }

    await dispatch(type, { eventId: id, shopId, provider, externalId, payload })
    await webhookEventsRepo.markProcessed(id, 'PROCESSED')
    return { processed: true }
  } catch (error) {
    await webhookEventsRepo.markProcessed(id, 'FAILED', error.message)
    logger.error({ err: error, eventId: id, provider, type }, 'webhook handler failed')
    return { failed: true, error: error.message }
  }
}

export async function dispatch(type, envelopeValue) {
  const list = listeners(type)
  if (!list.length) {
    logger.debug({ type }, 'no handler registered for event type')
    return
  }
  const results = await Promise.allSettled(list.map((handler) => handler(envelopeValue)))
  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length) {
    throw new AggregateError(rejected.map((r) => r.reason), `${rejected.length} handler(s) failed for ${type}`)
  }
}

// Placeholder handlers for today; features replace them with their own onEvent() registrations.
for (const type of EVENT_TYPES) {
  onEvent(type, async ({ eventId, provider, shopId, externalId }) => {
    logger.info({ eventId, provider, shopId, externalId, type }, 'webhook event handled')
  })
}
