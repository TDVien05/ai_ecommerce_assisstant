import * as shopRepo from '../../repositories/shop/shop.repository.js'
import * as customerRepo from '../../repositories/messenger/customer.repository.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import * as messageRepo from '../../repositories/messenger/message.repository.js'
import * as graph from './graph.client.js'
import { env } from '../../config/env.js'
import { appError } from '../../errors/index.js'
import { logger } from '../../lib/logger.js'

/**
 * Sending messages back to a customer on Messenger.
 *
 * Two responsibilities the HTTP client must not have:
 *  1. Resolve the Page access token per shop (model A: each shop owns its own Page).
 *  2. Record what was sent in `messages` with role 'assistant', so the next bot turn sees its
 *     own previous reply in the history and does not repeat itself.
 *
 * A reply is only stored after Meta confirms it, so a failed send never leaves a phantom message
 * in the transcript.
 */

/**
 * Pick the token to use: the shop's own Page token, else the deployment-wide one.
 * Pure function so the "no token at all" branch is testable without touching the frozen env.
 */
export function resolveToken(shopToken, deploymentToken) {
  const token = shopToken || deploymentToken
  if (!token) {
    throw appError('MESSENGER_NOT_CONFIGURED', 'Cửa hàng chưa có Page access token để gửi tin nhắn.')
  }
  return token
}

/** Token for a shop: its own Page token first, then the deployment-wide one. */
export async function tokenForShop(shopId) {
  const shop = await shopRepo.findByIdWithToken(shopId)
  return resolveToken(shop?.fb_page_token, env.FB_PAGE_ACCESS_TOKEN)
}

/**
 * Fail fast when this shop cannot send at all, so the caller does not pay for a model call whose
 * answer could never be delivered. Throws MESSENGER_NOT_CONFIGURED.
 */
export async function assertCanSend(shopId) {
  await tokenForShop(shopId)
}

/** Customer + conversation for a PSID, creating both on first contact. */
async function contextFor(shopId, psid) {
  const customer = await customerRepo.upsertByPsid(shopId, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shopId, customer.id)
  return { customer, conversation }
}

/**
 * Anti-duplicate guard: has the bot already answered the message right before this one?
 *
 * Meta can deliver the same webhook twice, and a retried run would otherwise send a second
 * identical reply. We look at the last assistant row in the conversation and compare it with the
 * newest customer message we are replying to. No extra table, no locks.
 */
export async function alreadyAnswered(shopId, conversationId, inboundMid, db) {
  const recent = await messageRepo.listByConversation(shopId, conversationId, { limit: 2 }, db)
  if (recent.length < 2) return false
  const [previous, last] = recent
  // previous = the message before the newest one (the customer's), last = the newest.
  return last.role === 'assistant' && previous.mid === inboundMid
}

/**
 * Send a text reply and store it.
 * Returns `{ skipped: true }` when the bot already replied to this inbound message.
 */
export async function replyText({ shopId, psid, text, inboundMid = null }) {
  const { conversation } = await contextFor(shopId, psid)

  if (inboundMid && (await alreadyAnswered(shopId, conversation.id, inboundMid))) {
    logger.info({ shopId, inboundMid }, 'bot already answered this message, skipping')
    return { skipped: true }
  }

  const token = await tokenForShop(shopId)
  const result = await graph.sendText({ psid, text, token })

  const saved = await messageRepo.create(shopId, {
    conversationId: conversation.id,
    mid: result?.message_id ?? null,
    role: 'assistant',
    content: text,
  })

  return { skipped: false, messageId: result?.message_id ?? null, saved: Boolean(saved) }
}

/** Send the VietQR image, then a short caption. Two Send API calls, both stored. */
export async function replyImage({ shopId, psid, url, caption = null, inboundMid = null }) {
  const { conversation } = await contextFor(shopId, psid)

  if (inboundMid && (await alreadyAnswered(shopId, conversation.id, inboundMid))) {
    logger.info({ shopId, inboundMid }, 'bot already answered this message, skipping')
    return { skipped: true }
  }

  const token = await tokenForShop(shopId)
  const image = await graph.sendImage({ psid, url, token })

  const savedImage = await messageRepo.create(shopId, {
    conversationId: conversation.id,
    mid: image?.message_id ?? null,
    role: 'assistant',
    content: `[image] ${url}`,
  })

  let savedCaption = null
  if (caption) {
    const text = await graph.sendText({ psid, text: caption, token })
    savedCaption = await messageRepo.create(shopId, {
      conversationId: conversation.id,
      mid: text?.message_id ?? null,
      role: 'assistant',
      content: caption,
    })
  }

  return {
    skipped: false,
    messageId: image?.message_id ?? null,
    saved: Boolean(savedImage),
    captionSaved: Boolean(savedCaption),
  }
}

/** Quick replies offer canned answers without the customer typing. */
export async function replyQuickReplies({ shopId, psid, text, replies, inboundMid = null }) {
  const { conversation } = await contextFor(shopId, psid)

  if (inboundMid && (await alreadyAnswered(shopId, conversation.id, inboundMid))) {
    logger.info({ shopId, inboundMid }, 'bot already answered this message, skipping')
    return { skipped: true }
  }

  const token = await tokenForShop(shopId)
  const result = await graph.sendQuickReplies({ psid, text, replies, token })

  const saved = await messageRepo.create(shopId, {
    conversationId: conversation.id,
    mid: result?.message_id ?? null,
    role: 'assistant',
    content: text,
  })

  return { skipped: false, messageId: result?.message_id ?? null, saved: Boolean(saved) }
}
