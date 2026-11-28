import * as shopRepo from '../../repositories/shop/shop.repository.js'
import * as customerRepo from '../../repositories/messenger/customer.repository.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import * as messageRepo from '../../repositories/messenger/message.repository.js'
import * as graph from './graph.client.js'
import { appError } from '../../errors/index.js'
import { logger } from '../../lib/logger.js'

/**
 * One-off history backfill through the Conversations API.
 *
 * Not the main path: live messages arrive on /webhooks/messenger. Use this once, when a Page
 * is first connected, to pull the conversations that already exist.
 *
 * Meta limits this hard: you can list every message id of a conversation, but you can only
 * read the content of the 20 most recent. Older ids answer "message has been deleted", which
 * is why `maxPerConversation` defaults to 20 and older errors are counted, not thrown.
 */

const PAGE_LIMIT = 25
const MESSAGES_PER_CONVERSATION = 20

/** Meta gives `2026-11-27T15:20:00+0000`; JS needs `2026-11-27T15:20:00+00:00`. */
function parseMetaDate(value) {
  if (typeof value !== 'string') return null
  const fixed = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const date = new Date(fixed)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The Page's own replies are `assistant` rows; everything from the customer is `user`. */
function roleOf(fromId, pageId) {
  return String(fromId) === String(pageId) ? 'assistant' : 'user'
}

/**
 * Backfill one shop.
 *
 * @param {string} shopId
 * @param {{ pageId?: string, token?: string, maxConversations?: number, maxPerConversation?: number, dryRun?: boolean, shop?: object }} options
 * @returns {Promise<{conversations:number, saved:number, skipped:number, failed:number, expired:number}>}
 */
export async function backfillShop(shopId, options = {}) {
  const shop = options.shop ?? (await shopRepo.findByIdWithToken(shopId))
  if (!shop) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')

  // A demo copy shares the template's Page, and its rows are disposable.
  if (shop.is_demo) throw appError('BAD_REQUEST', 'Shop thử không nhập lịch sử; dùng shop thật.')

  const pageId = options.pageId ?? shop.fb_page_id
  if (!pageId) throw appError('BAD_REQUEST', 'Cửa hàng chưa gắn Page Facebook (fb_page_id).')

  const token = options.token ?? shop.fb_page_token ?? undefined
  if (!token && !graph.hasToken()) {
    throw appError('NOT_CONFIGURED', 'Thiếu Page access token để đọc lịch sử Messenger.')
  }

  const maxConversations = options.maxConversations ?? PAGE_LIMIT
  const maxPerConversation = options.maxPerConversation ?? MESSAGES_PER_CONVERSATION
  const stats = { conversations: 0, saved: 0, skipped: 0, failed: 0, expired: 0 }

  const conversations = await graph.listConversations({ pageId, token, limit: maxConversations })

  for (const conversation of conversations.slice(0, maxConversations)) {
    stats.conversations += 1

    // The customer is the participant that is not the Page itself.
    const participant = (conversation.participants?.data ?? []).find(
      (person) => String(person.id) !== String(pageId),
    )
    if (!participant?.id) {
      logger.warn({ conversationId: conversation.id }, 'conversation has no customer participant')
      continue
    }

    const customer = options.dryRun
      ? { id: null }
      : await customerRepo.upsertByPsid(shopId, { psid: String(participant.id), name: participant.name ?? null })
    const dbConversation = options.dryRun
      ? { id: conversation.id }
      : await conversationRepo.ensureForCustomer(shopId, customer.id)

    if (options.dryRun) {
      const ids = await graph.listMessageIds({ conversationId: conversation.id, token })
      stats.saved += Math.min(ids.length, maxPerConversation)
      continue
    }

    const ids = await graph.listMessageIds({ conversationId: conversation.id, token })

    for (const entry of ids.slice(0, maxPerConversation)) {
      try {
        const message = await graph.getMessage({ messageId: entry.id, token })
        const text = message?.message ?? null
        if (!text) {
          stats.skipped += 1
          continue
        }

        const saved = await messageRepo.createAt(shopId, {
          conversationId: dbConversation.id,
          mid: message.id,
          role: roleOf(message.from?.id, pageId),
          content: text,
          createdAt: parseMetaDate(message.created_time),
        })
        if (saved) stats.saved += 1
        else stats.skipped += 1
      } catch (error) {
        // Past the 20-message window Meta answers "message has been deleted".
        if (/deleted|does not exist/i.test(error?.message ?? '')) stats.expired += 1
        else {
          stats.failed += 1
          logger.warn({ err: error, messageId: entry.id }, 'could not backfill a message')
        }
      }
    }
  }

  logger.info({ shopId, ...stats }, 'messenger history backfill finished')
  return stats
}
