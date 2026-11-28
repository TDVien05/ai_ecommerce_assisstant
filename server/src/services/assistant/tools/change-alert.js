import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { appError } from '../../../errors/index.js'
import * as alerts from '../../../repositories/alerts/assistantAlert.repository.js'
import * as messages from '../../../repositories/assistant/assistantMessage.repository.js'
import * as threads from '../../../repositories/assistant/assistantThread.repository.js'
import { formatTime } from '../view.js'
const clone = (value) => JSON.parse(JSON.stringify(value))
const conflict = () => appError('STEP_CONFLICT', 'Dữ liệu đã thay đổi; không thể thực hiện thao tác.')
const missing = (code) => appError(code)

export const changeAlert = {
  name: 'change_alert_status', schema: z.object({ id: z.string().uuid(), status: z.enum(['HELD', 'DISMISSED']) }).strict(),
  async propose(input, ctx) {
    const row = await alerts.find(ctx.shopId, input.id)
    if (!row) throw missing('ALERT_NOT_FOUND')
    if (row.status !== 'OPEN') throw conflict()
    return { tool: this.name, input, expected: { id: row.id, status: row.status, title: row.title } }
  },
  async apply(client, input, ctx, expected) {
    const row = await alerts.find(ctx.shopId, input.id, client, true)
    if (!row || row.status !== expected.status || row.title !== expected.title) throw conflict()
    const priorMessage = await messages.getMessage(ctx.shopId, `risk-${input.id}`, client, true)
    const priorThread = await threads.getThread(ctx.shopId, `alert-${input.id}`, client, true)
    await alerts.setStatus(ctx.shopId, input.id, input.status, client)
    const nextMessage = priorMessage ? { ...priorMessage, blocks: [{ type: 'text', text: input.status === 'HELD' ? 'Đã tạm giữ cảnh báo. Trạng thái đơn hàng không thay đổi.' : 'Đã bỏ qua cảnh báo. Trạng thái đơn hàng không thay đổi.' }] } : null
    if (nextMessage) await messages.updateMessage(ctx.shopId, nextMessage.id, nextMessage, client)
    const nextThread = priorThread ? await threads.setThread(ctx.shopId, priorThread.id, 'done', client) : null
    return { before: { id: row.id, status: row.status, title: row.title, message: priorMessage, thread: priorThread ? clone(priorThread) : null }, after: { id: row.id, status: input.status, title: row.title, message: nextMessage, thread: nextThread ? clone(nextThread) : null } }
  },
  async revert(client, log, ctx) {
    const row = await alerts.find(ctx.shopId, log.after.id, client, true)
    if (!row || row.status !== log.after.status || row.title !== log.after.title) throw conflict()
    if (log.after.message) {
      const currentMessage = await messages.getMessage(ctx.shopId, log.after.message.id, client, true)
      if (!isDeepStrictEqual(currentMessage, log.after.message)) throw conflict()
      await messages.updateMessage(ctx.shopId, log.before.message.id, log.before.message, client)
    }
    if (log.after.thread) {
      const currentThread = await threads.getThread(ctx.shopId, log.after.thread.id, client, true)
      if (!currentThread || !isDeepStrictEqual(clone(currentThread), log.after.thread)) throw conflict()
      await threads.setThread(ctx.shopId, log.before.thread.id, log.before.thread.status, client)
    }
    await alerts.setStatus(ctx.shopId, row.id, log.before.status, client)
  },
  events(snapshot) {
    const thread = snapshot.thread
    return [
      ...(snapshot.message ? [{ type: 'message', conversationId: `alert-${snapshot.id}`, message: snapshot.message }] : []),
      ...(thread ? [{ type: 'thread', thread: { id: thread.id, title: thread.title, scope: thread.scope, status: thread.status, updatedAt: formatTime(new Date()) } }] : []),
    ]
  },
}
