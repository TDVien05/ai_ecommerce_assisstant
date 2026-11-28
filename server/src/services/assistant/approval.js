import { z } from 'zod'
import { withTransaction } from '../../repositories/database.js'
import { appError } from '../../errors/index.js'
import * as store from './store.js'
import { publish } from './events.js'
import { resolvedActions } from './steps.js'
import { changeToolByName as tools } from './tools/change.js'
import { updateThread, publishUpdate } from './threads.js'
import { verifyOwnerPassword } from './password.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import { requestProactiveScan } from './proactive.service.js'

const notFound = () => appError('STEP_NOT_FOUND', 'Không tìm thấy bước cần duyệt.')
const conflict = () => appError('STEP_CONFLICT', 'Bước đã thay đổi hoặc không thể thực hiện.')
const badInput = () => appError('BAD_REQUEST', 'Thông tin trả lời không hợp lệ.')

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
  publishUpdate(auth.shopId,result.update)
}

export async function sensitiveDetails(auth,id) {
  return withTransaction(async(client)=>{
    const step=await getLocked(auth,id,client)
    if(step.state!=='waiting')throw conflict()
    const action=step.actions.find((item)=>tools.get(item.tool)?.requiresPassword)
    if(!action)throw notFound()
    return tools.get(action.tool).details(action)
  })
}

export async function messageRecipients(auth) { return {items:await conversationRepo.listRecipients(auth.shopId)} }
export async function updateMessageDraft(auth,id,input) {
  const result=await withTransaction(async(client)=>{
    const step=await getLocked(auth,id,client)
    if(step.state!=='waiting')throw conflict()
    const action=step.actions.find((item)=>tools.get(item.tool)?.messageDraft)
    if(!action || step.actions.length!==1)throw notFound()
    if(!await conversationRepo.findById(auth.shopId,input.conversationId,client))throw notFound()
    action.input=input
    await store.saveActions(auth.shopId,id,step.actions,client)
    const view={...step.view,messageDraft:input}
    return {step,message:await store.saveStepAndMessage(step,view,client)}
  })
  notify(auth,result.step,result.message)
}

export async function approve(auth, id, { password } = {}) {
  const result = await withTransaction(async (client) => {
    const step = await getLocked(auth, id, client)
    if (step.state !== 'waiting') throw conflict()
    if (step.actions.some((action)=>tools.get(action.tool)?.requiresPassword)) await verifyOwnerPassword(auth,password,client)
    let actions
    try { actions = resolvedActions(step.actions, step.view) } catch { throw badInput() }
    if (!Array.isArray(actions) || !actions.length) throw conflict()
    let count = 0
    let singleChange
    const events = []
    for (const [order, action] of actions.entries()) {
      const tool = tools.get(action.tool)
      const input = tool?.schema.safeParse(action.input)
      if (!input?.success) throw badInput()
      const log = await tool.apply(client, input.data, {...auth,stepId:step.id,conversationId:step.conversation_id}, action.expected)
      if (tool.events) events.push(...tool.events(log.after))
      const before = log.before ? { ...log.before, order } : null
      const after = log.after ? { ...log.after, order } : null
      await store.addLog(auth.shopId, step.id, auth.userId, tool.name, before, after, client)
      const entries = (log.after ?? log.before).entries
      count += tool.countChange===false ? 0 : entries?.length ?? 1
      if (entries?.length === 1) singleChange = { tool: tool.name, entry: entries[0] }
    }
    const description = count === 1 && singleChange && ['add_ledger_entries', 'delete_manual_entry'].includes(singleChange.tool)
      ? `Đã ${singleChange.tool === 'add_ledger_entries' ? 'ghi' : 'xóa'} khoản ${singleChange.entry.type === 'INCOME' ? 'thu' : 'chi'} ${singleChange.entry.amount.toLocaleString('vi-VN')} ₫.`
      : `Đã thực hiện ${count} thay đổi.`
    const view = { ...step.view, state: 'done', doneText: description, steps: step.view.steps.map((item) => ({ ...item, status: 'done' })) }
    const message = await store.saveStepAndMessage(step, view, client)
    const update = step.conversation_id === 'hub' ? null : await updateThread(auth.shopId,step.conversation_id,'done','Sao kê đã được duyệt và ghi sổ.',client)
    return { step, message, description, update, events }
  })
  notify(auth, result.step, result.message)
  for (const event of result.events) publish(auth.shopId, event)
  publishUpdate(auth.shopId,result.update)
  requestProactiveScan(auth.shopId, { opened: true, force: true })
  return { message: result.description }
}

export async function undo(auth, id, { password } = {}) {
  let result
  try {
    result = await withTransaction(async (client) => {
      const step = await getLocked(auth, id, client)
      if (step.state !== 'done') throw conflict()
      if (step.actions.some((action)=>tools.get(action.tool)?.requiresPassword)) await verifyOwnerPassword(auth,password,client)
      const logs = await store.getLogs(auth.shopId, id, client)
      if (!logs.length) throw conflict()
      const events = []
      logs.sort((a, b) => (b.after ?? b.before).order - (a.after ?? a.before).order)
      for (const log of logs) {
        const tool = tools.get(log.tool)
        if (!tool) throw conflict()
        await tool.revert(client, log, {...auth,stepId:step.id,conversationId:step.conversation_id})
        if (tool.events) events.push(...tool.events(log.before))
      }
      await store.markUndone(auth.shopId, id, client)
      const view = { ...step.view, state: 'undone', doneText: 'Đã hoàn tác thay đổi.', steps: step.view.steps.map((item) => ({ ...item, status: 'skipped' })) }
      const message = await store.saveStepAndMessage(step, view, client)
      const update = step.conversation_id === 'hub' ? null : await updateThread(auth.shopId,step.conversation_id,'done','Đã hoàn tác các khoản từ sao kê.',client)
      return { step, message, update, events }
    })
  } catch (error) {
    if (['23503', '23505'].includes(error.code)) throw conflict()
    throw error
  }
  notify(auth, result.step, result.message)
  for (const event of result.events) publish(auth.shopId, event)
  publishUpdate(auth.shopId,result.update)
  requestProactiveScan(auth.shopId, { opened: true, force: true })
}
