import * as messageRepo from '../../repositories/messenger/message.repository.js'
import * as shopRepo from '../../repositories/shop/shop.repository.js'
import { runToolLoop, loadPrompt, wrapUntrusted, isAiUnavailable } from '../ai/index.js'
import { replyText, replyImage, assertCanSend } from './send.service.js'
import { botTools } from './tools/bot.tools.js'
import { logger } from '../../lib/logger.js'

/**
 * The Messenger bot: turn one customer message into one reply.
 *
 * Tools come from `tools/bot.tools.js` (search products, customer profile, create order, check
 * payment, hand over to a human). The money invariant lives there: the model may pass product
 * ids and quantities, never an amount — prices and the total are read from the database.
 *
 * Design notes:
 *  - The customer's text always goes in a user message wrapped by `wrapUntrusted`, never into the
 *    system prompt. The prompt tells the model that anything inside `<tin_nhan_khach>` is data.
 *  - History is the last 20 stored messages, which already includes the bot's own replies, so the
 *    model does not repeat itself.
 *  - `isAiUnavailable` is caught: a dead provider must leave the conversation usable, not crash
 *    the webhook. The customer gets a short honest message instead of silence.
 *  - `canSend` runs first: paying for a model call whose answer can never be delivered is waste.
 */

const HISTORY_LIMIT = 20

/** Map stored rows to the model's message shape. Tool rows are not shown to the customer. */
export function toChatMessages(rows) {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .filter((row) => typeof row.content === 'string' && row.content.trim())
    .map((row) => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content:
        row.role === 'assistant'
          ? row.content
          : // Only wrap the customer side: it is the untrusted input.
            wrapUntrusted(row.content, 'tin_nhan_khach'),
    }))
}

/**
 * Build the message list sent to the model.
 * `shopName` goes into the system prompt because it is trusted server-side data.
 */
export function buildBotMessages({ shopName, history }) {
  return [
    { role: 'system', content: loadPrompt('bot', { shop_name: shopName }) },
    ...toChatMessages(history),
  ]
}

/** What the customer sees when the AI cannot answer. Short, honest, no promise. */
export const FALLBACK_REPLY =
  'Shop đang bận một chút, bạn chờ shop kiểm tra rồi trả lời ngay nhé.'

/**
 * Find the VietQR to send, if the bot just created an order.
 *
 * Only a *successful* `create_order` counts: a failed call carries an error string, not an order.
 * `paymentReady === false` means the shop has no receiving account, so there is no image to send —
 * the model's text already tells the customer to wait, and a broken image would look worse.
 */
export function qrFromToolCalls(toolCalls) {
  for (const call of toolCalls ?? []) {
    if (call.name !== 'create_order' || !call.ok) continue
    const output = call.output
    if (output?.paymentReady && output?.qrUrl) {
      return { qrUrl: output.qrUrl, paymentCode: output.paymentCode, totalText: output.totalText }
    }
  }
  return null
}

/**
 * Answer one inbound customer message.
 *
 * @param {object} input
 * @param {string} input.shopId
 * @param {string} input.psid
 * @param {string} input.conversationId
 * @param {string} input.inboundMid  to dedupe a retried webhook
 * @param {object} [input.reservation] quota reservation from gate.service (commit/refund)
 * @param {Function} [input.runAi]  injectable for tests; defaults to the real tool loop
 * @param {Function} [input.canSend] injectable for tests; defaults to the real token check
 * @returns {Promise<{replied: boolean, reason?: string, text?: string}>}
 */
export async function answerCustomer({
  shopId,
  psid,
  conversationId,
  inboundMid,
  reservation = null,
  runAi = runToolLoop,
  canSend = assertCanSend,
}) {
  const shop = await shopRepo.findById(shopId)
  if (!shop) {
    reservation?.refund()
    return { replied: false, reason: 'shop_not_found' }
  }

  // Check we can actually deliver BEFORE spending money on the model. Without a Page token the
  // reply would be generated and then thrown away — a paid call with no result.
  try {
    await canSend(shopId)
  } catch (error) {
    reservation?.refund()
    logger.warn({ shopId, psid, code: error.code }, 'cannot send, bot skipped before calling AI')
    return { replied: false, reason: 'cannot_send', error: error.message }
  }

  // The order matters: the customer's newest message is already stored, so it is in the history.
  const history = await messageRepo.listByConversation(shopId, conversationId, { limit: HISTORY_LIMIT })
  const messages = buildBotMessages({ shopName: shop.name, history })

  let text
  let toolCalls = []
  try {
    const result = await runAi({
      role: 'bot',
      messages,
      tools: botTools,
      // ctx comes from the server, never from the model: one customer cannot reach another shop.
      ctx: { shopId, psid, conversationId },
    })
    text = String(result.text ?? '').trim()
    toolCalls = result.toolCalls ?? []
    reservation?.commit()
  } catch (error) {
    reservation?.refund()
    if (isAiUnavailable(error)) {
      logger.warn({ shopId, psid, reason: error.reason }, 'bot AI unavailable, sending fallback')
      text = FALLBACK_REPLY
    } else {
      // A real bug must be visible, but the customer should not be left without an answer.
      logger.error({ err: error, shopId, psid }, 'bot turn failed')
      text = FALLBACK_REPLY
    }
  }

  if (toolCalls.length) {
    logger.info(
      { shopId, psid, tools: toolCalls.map((call) => ({ name: call.name, ok: call.ok })) },
      'bot used tools',
    )
  }

  if (!text) {
    // An empty completion is not worth sending; the customer would see a blank bubble.
    return { replied: false, reason: 'empty_reply', toolCalls }
  }

  const sent = await replyText({ shopId, psid, text, inboundMid })
  if (sent.skipped) return { replied: false, reason: 'duplicate', text, toolCalls }

  // The order was just created: put the QR in the chat so the customer can scan it.
  // Sent AFTER the text so the explanation lands first and the image is the last thing they see.
  //
  // No `inboundMid` here on purpose: the dedupe check looks for "the bot already answered", and
  // the text reply we just sent would make it skip the image. The dedupe that matters already
  // happened above; this call belongs to the same turn.
  let imageSent = null
  const qr = qrFromToolCalls(toolCalls)
  if (qr) {
    try {
      imageSent = await replyImage({
        shopId,
        psid,
        url: qr.qrUrl,
        caption: `Mã đơn ${qr.paymentCode} · ${qr.totalText}. Quét mã để chuyển đúng số tiền và nội dung.`,
      })
    } catch (error) {
      // The text already went out, so the customer is not left hanging. The shop owner can send
      // the code by hand; this must not turn a successful order into a failed turn.
      logger.warn({ err: error, shopId, psid, paymentCode: qr.paymentCode }, 'could not send payment QR')
    }
  }

  return { replied: true, text, toolCalls, qrSent: Boolean(imageSent && !imageSent.skipped) }
}
