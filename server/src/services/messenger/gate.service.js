import * as customerRepo from '../../repositories/messenger/customer.repository.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import { createRunLimiter } from '../assistant/quota.js'
import { env } from '../../config/env.js'

/**
 * Should the bot reply to this incoming Messenger message, or stay quiet?
 *
 * Two gates, cheapest first. This runs BEFORE any AI call, so a paused conversation or an
 * exhausted quota costs nothing:
 *
 *  1. `ai_paused` — the shop owner has taken over this conversation. The message is still
 *     stored (the owner wants to read it), the bot just must not answer over them.
 *  2. Daily quota — a customer spamming 1000 messages must not burn the AI budget.
 *     Counted per shop, because that is who pays.
 *
 * Returning a reason instead of a boolean keeps the caller honest: the reason goes into the log
 * and, when it matters, into a `todos` row for the owner.
 */

/** Per-shop daily cap for Messenger bot turns. Shares AI_DAILY_RUN_LIMIT with the assistant. */
export const reserveBotRun = createRunLimiter(env.AI_DAILY_RUN_LIMIT)

/**
 * Decide whether the bot may answer.
 *
 * @param {string} shopId
 * @param {string} psid
 * @returns {Promise<{reply: boolean, reason: string, conversationId: string|null, reservation: {commit():void, refund():void}|null}>}
 */
export async function checkBotReply(shopId, psid) {
  if (!shopId || !psid) {
    return { reply: false, reason: 'missing_shop_or_psid', conversationId: null, reservation: null }
  }

  // Find or create the conversation: even a paused one must exist so the message can be stored.
  const customer = await customerRepo.upsertByPsid(shopId, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shopId, customer.id)

  if (conversation.ai_paused) {
    return { reply: false, reason: 'ai_paused', conversationId: conversation.id, reservation: null }
  }

  // Quota is reserved here and refunded by the caller when the AI call fails, so a broken
  // provider does not consume the shop's daily turns.
  try {
    const reservation = reserveBotRun(shopId)
    return { reply: true, reason: 'ok', conversationId: conversation.id, reservation }
  } catch (error) {
    if (error?.code === 'AI_DAILY_LIMIT') {
      return { reply: false, reason: 'daily_limit', conversationId: conversation.id, reservation: null }
    }
    throw error
  }
}

/** Hand the conversation back to the shop owner: the bot stops answering this customer. */
export async function pauseConversation(shopId, conversationId) {
  return conversationRepo.setAiPaused(shopId, conversationId, true)
}

/** Let the bot answer this customer again. */
export async function resumeConversation(shopId, conversationId) {
  return conversationRepo.setAiPaused(shopId, conversationId, false)
}

/**
 * Set the flag from an API call. Returns null when the conversation is not this shop's, so the
 * controller can answer 400 without leaking whether the id exists for another tenant.
 */
export async function setBotPaused(shopId, conversationId, aiPaused) {
  return conversationRepo.setAiPaused(shopId, conversationId, Boolean(aiPaused))
}
