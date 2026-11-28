import { randomUUID } from 'node:crypto'
import { withTransaction } from '../../db/pool.js'
import { HttpError } from '../../lib/httpError.js'
import { logger } from '../../lib/logger.js'
import * as store from './store.js'
import * as events from './events.js'
import { snapshotView } from './view.js'
import { runAgent } from './agent.js'
import { startStatement, updateThread } from './threads.js'
import { reserveAgentRun } from './quota.js'

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không tìm thấy hội thoại hoặc tệp.')
const activeRuns = new Map()
let shuttingDown = false

export async function snapshot(shopId) {
  const data = await store.loadSnapshot(shopId)
  if (!data) throw notFound()
  return snapshotView(data, events.typingFor(shopId))
}
export const subscribe = events.subscribe

export async function sendMessage({ shopId, userId }, { conversationId, text, attachments }) {
  if (shuttingDown) throw new HttpError(503, 'ASSISTANT_UNAVAILABLE', 'Máy chủ đang khởi động lại. Vui lòng thử lại sau.')
  if (attachments.length) {
    if (conversationId !== 'hub') throw new HttpError(400,'INVALID_FILE','Hãy gửi sao kê tại chat trung tâm.')
    const reservation=reserveAgentRun(shopId)
    try { await startStatement({shopId,userId},{text,attachments}); reservation.commit(); return } catch(error) { reservation.refund(); throw error }
  }
  if (!events.acquire(shopId, conversationId)) throw new HttpError(409, 'ASSISTANT_BUSY', 'Hội thoại đang xử lý, vui lòng thử lại sau.')
  const key = JSON.stringify([shopId, conversationId])
  const controller = new AbortController()
  let complete
  const done = new Promise((resolve) => { complete = resolve })
  activeRuns.set(key, { controller, done })
  const finish = () => { activeRuns.delete(key); events.release(shopId, conversationId); complete() }
  let reservation
  try {
    if (!await store.conversationExists(shopId, conversationId) || !await store.attachmentsExist(shopId, attachments)) throw notFound()
    if (controller.signal.aborted) throw new HttpError(503, 'ASSISTANT_UNAVAILABLE', 'Máy chủ đang khởi động lại. Vui lòng thử lại sau.')
    reservation=reserveAgentRun(shopId)
    const message = { id: randomUUID(), role: 'user', text, ...(attachments.length ? { files: attachments.map((file) => file.name) } : {}) }
    await store.insertMessage(shopId, conversationId, message)
    reservation.commit()
    events.publish(shopId, { type: 'message', conversationId, message })
    events.publish(shopId, { type: 'typing', conversationId, value: true })
    setImmediate(async () => {
      try {
        if (controller.signal.aborted) return
        const history = await store.recentMessages(shopId, conversationId)
        const ctx = { shopId, userId, runId: randomUUID() }
        const blocks = await runAgent({ text, history, ctx, signal: controller.signal })
        if (controller.signal.aborted) return
        const reply = { id: randomUUID(), role: 'assistant', blocks }
        await withTransaction(async (client) => {
          await store.insertMessage(shopId, conversationId, reply, client)
          if (ctx.pendingStep) await store.createStep(shopId, conversationId, reply.id, ctx.pendingStep, client)
        })
        events.publish(shopId, { type: 'message', conversationId, message: reply })
      } catch (err) {
        if (controller.signal.aborted) return
        logger.error({ err }, 'Assistant reply failed')
        try {
          const reply = { id: randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.' }] }
          await store.insertMessage(shopId, conversationId, reply)
          events.publish(shopId, { type: 'message', conversationId, message: reply })
        } catch (saveError) { logger.error({ err: saveError }, 'Assistant error reply failed') }
      }
      finally { finish(); events.publish(shopId, { type: 'typing', conversationId, value: false }) }
    })
  } catch (err) { reservation?.refund(); finish(); throw err }
}

export async function recover() {
  await withTransaction(async (client) => {
    const threads = await store.recoverInterrupted(client)
    for (const thread of threads.rows) {
      const message = { id: randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: 'Tác vụ bị gián đoạn khi máy chủ khởi động lại. Vui lòng thử lại.' }] }
      await store.insertMessage(thread.shop_id, thread.id, message, client)
      await updateThread(thread.shop_id,thread.id,'done','Tác vụ sao kê bị gián đoạn; mở luồng để xem chi tiết.',client)
    }
    const unanswered = await store.unansweredConversations(client)
    for (const conversation of unanswered) {
      const message = { id: randomUUID(), role: 'assistant', blocks: [{ type: 'text', text: 'Lượt trả lời bị gián đoạn. Bạn vui lòng gửi lại tin nhắn.' }] }
      await store.insertMessage(conversation.shop_id, conversation.conversation_id, message, client)
    }
  })
}

export async function interruptActive() {
  shuttingDown = true
  const runs = [...activeRuns.values()]
  for (const run of runs) run.controller.abort()
  await Promise.all(runs.map((run) => run.done))
  await recover()
}
