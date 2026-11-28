import { randomUUID } from 'node:crypto'
import { kindOptions, channelOptions } from './tools/finance.write.js'
import { changeToolByName } from './tools/change.js'

export function makeStep(actions) {
  const steps = [], questions = []
  for (const [index, action] of actions.entries()) {
    const tool = changeToolByName.get(action.tool)
    if (!tool?.describe) throw new Error('Unsupported change')
    const result = tool.describe(action, index)
    steps.push(...result.steps)
    questions.push(...(result.questions ?? []))
  }
  const ledgerOnly = actions.every((action) => changeToolByName.get(action.tool)?.entity === 'ledger')
  const entities = [...new Set(actions.map((action) => action.entity ?? changeToolByName.get(action.tool).entity))]
  return { type: 'agentStep', stepId: randomUUID(), title: ledgerOnly ? 'Thay đổi sổ thu chi' : 'Thay đổi dữ liệu', state: 'waiting', entities, steps, ...(questions.length ? { questions } : {}), approveLabel: ledgerOnly ? 'Duyệt và ghi sổ' : 'Duyệt thay đổi', undoNote: 'Hoàn tác sẽ khôi phục trạng thái trước khi duyệt.' }
}

export function resolvedActions(actions, view) {
  const result = structuredClone(actions)
  for (const question of view.questions ?? []) {
    if (!question.value || !question.options.includes(question.value)) throw new Error('QUESTIONS_UNANSWERED')
    const [actionIndex, entryIndex, field] = question.id.split(':')
    const entry = result[Number(actionIndex)]?.input?.entries?.[Number(entryIndex)]
    const value = (field === 'kind' ? kindOptions : channelOptions)[question.value]
    if (!entry || !['kind', 'channel'].includes(field) || !value) throw new Error('QUESTIONS_UNANSWERED')
    entry[field] = value
  }
  return result
}
