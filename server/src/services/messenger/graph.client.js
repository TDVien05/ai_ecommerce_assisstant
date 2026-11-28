// Graph API client for Messenger history. The only file that talks to Meta.
// Free API, no SDK: plain fetch, exactly like services/ai/client.js talks to the LLM.
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { appError } from '../../errors/index.js'

const TIMEOUT_MS = 15000
const BASE = () => `https://graph.facebook.com/${env.GRAPH_API_VERSION}`

async function call(path, params, token) {
  const url = new URL(`${BASE()}/${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  url.searchParams.set('access_token', token)

  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    logger.warn({ err: error, path }, 'Graph API request failed')
    throw appError('MESSENGER_API_FAILED', 'Không gọi được Graph API của Meta.')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) {
    // Meta explains permission problems here (e.g. missing pages_messaging or App Review).
    logger.warn(
      { path, status: response.status, metaCode: payload?.error?.code, metaMessage: payload?.error?.message },
      'Graph API returned an error',
    )
    throw appError('MESSENGER_API_FAILED', 'Meta từ chối yêu cầu. Kiểm tra quyền của Page access token.')
  }
  return payload
}

export function hasToken() {
  return Boolean(env.FB_PAGE_ACCESS_TOKEN)
}

/**
 * Send API call: POST /me/messages with a JSON body and the Page token.
 *
 * Kept separate from `call()` on purpose. `call()` is GET + query string and is used by the
 * history backfill; mixing in POST would put both paths at risk. Different shape, different bug.
 *
 * Meta error 10 code 2018278 means the 24-hour reply window has closed; callers get a specific
 * error code for that so they can tell the shop owner instead of retrying forever.
 */
async function post(path, body, token) {
  let response
  try {
    response = await fetch(`${BASE()}/${path}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    logger.warn({ err: error, path }, 'Graph API send failed')
    throw appError('MESSENGER_API_FAILED', 'Không gửi được tin nhắn tới Meta.')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error) {
    const metaError = payload?.error ?? {}
    const windowClosed = metaError.code === 10 || metaError.error_subcode === 2018278
    logger.warn(
      { path, status: response.status, metaCode: metaError.code, metaSubcode: metaError.error_subcode, metaMessage: metaError.message },
      'Graph API rejected the message',
    )
    if (windowClosed) {
      throw appError('MESSENGER_WINDOW_CLOSED', 'Đã quá 24 giờ kể từ tin nhắn cuối của khách; không trả lời tự động được.')
    }
    throw appError('MESSENGER_API_FAILED', 'Meta từ chối tin nhắn. Kiểm tra quyền pages_messaging của Page token.')
  }
  return payload
}

/** Plain text reply. `messaging_type: RESPONSE` is required inside the 24-hour window. */
export async function sendText({ psid, text, token = env.FB_PAGE_ACCESS_TOKEN }) {
  return post(
    'me/messages',
    { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text } },
    token,
  )
}

/** Image by public URL (the VietQR link, for example). Meta fetches it, so it must be reachable. */
export async function sendImage({ psid, url, token = env.FB_PAGE_ACCESS_TOKEN }) {
  return post(
    'me/messages',
    {
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: { attachment: { type: 'image', payload: { url, is_reusable: true } } },
    },
    token,
  )
}

/**
 * Up to 13 quick replies: buttons that send a canned phrase back as a normal message.
 * Used to offer "Xem đơn", "Chuyển khoản" without the customer typing.
 */
export async function sendQuickReplies({ psid, text, replies, token = env.FB_PAGE_ACCESS_TOKEN }) {
  if (!Array.isArray(replies) || !replies.length) {
    throw new Error('sendQuickReplies needs at least one reply')
  }
  return post(
    'me/messages',
    {
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message: {
        text,
        quick_replies: replies.slice(0, 13).map((reply) => ({
          content_type: 'text',
          title: String(reply.title).slice(0, 20),
          payload: reply.payload ?? reply.title,
        })),
      },
    },
    token,
  )
}

/**
 * Conversations of a Page, newest first, with their participants.
 * GET /{page-id}/conversations?platform=messenger&fields=participants,updated_time
 */
export async function listConversations({ pageId, token = env.FB_PAGE_ACCESS_TOKEN, limit = 25 }) {
  const payload = await call(
    `${pageId}/conversations`,
    { platform: 'messenger', fields: 'participants,updated_time', limit },
    token,
  )
  return payload?.data ?? []
}

/**
 * Message ids of one conversation, newest first.
 * GET /{conversation-id}?fields=messages
 */
export async function listMessageIds({ conversationId, token = env.FB_PAGE_ACCESS_TOKEN }) {
  const payload = await call(conversationId, { fields: 'messages' }, token)
  return payload?.messages?.data ?? []
}

/**
 * Content of one message.
 * GET /{message-id}?fields=id,created_time,from,to,message
 */
export async function getMessage({ messageId, token = env.FB_PAGE_ACCESS_TOKEN }) {
  return call(messageId, { fields: 'id,created_time,from,to,message' }, token)
}
