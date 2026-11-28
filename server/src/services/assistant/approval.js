import { z } from 'zod'
import { withTransaction } from '../../db/pool.js'
import { HttpError } from '../../lib/httpError.js'
import * as store from './store.js'
import { publish } from './events.js'
import { resolvedActions } from './steps.js'
import { writeTools } from './tools/finance.write.js'
import { updateOrderStatus } from './tools/orders.js'
import { updateShop } from './tools/shop.js'

const notFound = () => new HttpError(404, 'STEP_NOT_FOUND', 'Không tìm thấy bước cần duyệt.')
const conflict = () => new HttpError(409, 'STEP_CONFLICT', 'Bước đã thay đổi hoặc không thể thực hiện.')
const badInput = () => new HttpError(400, 'BAD_REQUEST', 'Thông tin trả lời không hợp lệ.')
const tools = new Map([...writeTools, updateOrderStatus, updateShop].map((tool) => [tool.name, tool]))

async function getLocked(auth, id, client) {
  if (!z.string().uuid().safeParse(id).success) throw notFound()
  const step = await store.lockStep(auth.shopId, id, client)
  if (!step) throw notFound()
  return step
}
function notify(auth, step, message) { publish(auth.shopId, { type: 'message', conversationId: step.conversation_id, message }) }

export async function answer(auth, id, { questionId, option }) {
  const result = await withTransaction(async (client) => {
    const step = await getLocked(auth, id, client)
    if (step.state !== 'waiting') throw conflict()
    const view = structuredClone(step.view)
    const question = view.questions?.find((item) => item.id === questionId)
    if (!question || !question.options.includes(option)) throw badInput()
    question.value = option
    return { step, message: await store.saveStepAndMessage(step, view, client) }
  })
  notify(auth, result.step, result.message)
}

export async function approve(auth, id) {
  const result = await withTransaction(async (client) => {
    const step = await getLocked(auth, id, client)
    if (step.state !== 'waiting') throw conflict()
    let actions
    try { actions = resolvedActions(step.actions, step.view) } catch { throw badInput() }
    if (!Array.isArray(actions) || !actions.length) throw conflict()
    let count = 0
    let singleChange
    for (const [order, action] of actions.entries()) {
      const tool = tools.get(action.tool)
      const input = tool?.schema.safeParse(action.input)
      if (!input?.success) throw badInput()
      const log = await tool.apply(client, input.data, auth, action.expected)
      const before = log.before ? { ...log.before, order } : null
      const after = log.after ? { ...log.after, order } : null
      await store.addLog(auth.shopId, step.id, auth.userId, tool.name, before, after, client)
      const entries = (log.after ?? log.before).entries
      count += entries?.length ?? 1
      if (entries?.length === 1) singleChange = { tool: tool.name, entry: entries[0] }
    }
    const description = count === 1 && singleChange
      ? `Đã ${singleChange.tool === 'add_ledger_entries' ? 'ghi' : 'xóa'} khoản ${singleChange.entry.type === 'INCOME' ? 'thu' : 'chi'} ${singleChange.entry.amount.toLocaleString('vi-VN')} ₫.`
      : `Đã thực hiện ${count} thay đổi.`
    const view = { ...step.view, state: 'done', doneText: description, steps: step.view.steps.map((item) => ({ ...item, status: 'done' })) }
    return { step, message: await store.saveStepAndMessage(step, view, client), description }
  })
  notify(auth, result.step, result.message)
  return { message: result.description }
}

export async function undo(auth, id) {
  let result
  try {
    result = await withTransaction(async (client) => {
      const step = await getLocked(auth, id, client)
      if (step.state !== 'done') throw conflict()
      const logs = await store.getLogs(auth.shopId, id, client)
      if (!logs.length) throw conflict()
      logs.sort((a, b) => (b.after ?? b.before).order - (a.after ?? a.before).order)
      for (const log of logs) {
        const tool = tools.get(log.tool)
        if (!tool) throw conflict()
        await tool.revert(client, log, auth)
      }
      await store.markUndone(auth.shopId, id, client)
      const view = { ...step.view, state: 'undone', doneText: 'Đã hoàn tác thay đổi.', steps: step.view.steps.map((item) => ({ ...item, status: 'skipped' })) }
      return { step, message: await store.saveStepAndMessage(step, view, client) }
    })
  } catch (error) {
    if (['23503', '23505'].includes(error.code)) throw conflict()
    throw error
  }
  notify(auth, result.step, result.message)
}
