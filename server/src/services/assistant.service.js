import { randomUUID } from 'node:crypto'
import { withTransaction } from '../db/pool.js'
import { HttpError } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'
import * as store from './assistant/store.js'
import * as events from './assistant/events.js'
import { snapshotView } from './assistant/view.js'
import { runAgent } from './assistant/agent.js'

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không tìm thấy hội thoại hoặc tệp.')

export async function snapshot(shopId) {
  const data = await store.loadSnapshot(shopId)
  if (!data) throw notFound()
  return snapshotView(data, events.typingFor(shopId))
}
export const subscribe = events.subscribe

export async function sendMessage({ shopId, userId }, { conversationId, text, attachments }) {
  if (!events.acquire(shopId, conversationId)) throw new HttpError(409, 'ASSISTANT_BUSY', 'Hội thoại đang xử lý, vui lòng thử lại sau.')
  try {
    if (!await store.conversationExists(shopId, conversationId) || !await store.attachmentsExist(shopId, attachments)) throw notFound()
    const message = { id: randomUUID(), role: 'user', text, ...(attachments.length ? { files: attachments.map((file) => file.name) } : {}) }
    await store.insertMessage(shopId, conversationId, message)
    events.publish(shopId, { type: 'message', conversationId, message })
    events.publish(shopId, { type: 'typing', conversationId, value: true })
    setImmediate(async () => {
      try {
        const history = await store.recentMessages(shopId, conversationId)
        const ctx = { shopId, userId, runId: randomUUID() }
        const blocks = await runAgent({ text, history, ctx })
        const reply = { id: randomUUID(), role: 'assistant', blocks }
        await store.insertMessage(shopId, conversationId, reply)
        events.publish(shopId, { type: 'message', conversationId, message: reply })
      } catch (err) {
        logger.error({ err }, 'Assistant reply failed')
        try {
          const reply = { id: randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.' }] }
          await store.insertMessage(shopId, conversationId, reply)
          events.publish(shopId, { type: 'message', conversationId, message: reply })
        } catch (saveError) { logger.error({ err: saveError }, 'Assistant error reply failed') }
      }
      finally { events.release(shopId, conversationId); events.publish(shopId, { type: 'typing', conversationId, value: false }) }
    })
  } catch (err) { events.release(shopId, conversationId); throw err }
}

export async function recover() {
  await withTransaction(async (client) => {
    const threads = await store.recoverInterrupted(client)
    for (const thread of threads.rows) {
      const message = { id: randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: 'Tác vụ bị gián đoạn khi máy chủ khởi động lại. Vui lòng thử lại.' }] }
      await store.insertMessage(thread.shop_id, thread.id, message, client)
    }
  })
}
