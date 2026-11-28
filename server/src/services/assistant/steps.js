import { randomUUID } from 'node:crypto'
import { kindOptions, channelOptions } from './tools/finance.write.js'

export function makeStep(actions) {
  const questions = [], steps = []
  actions.forEach((action, actionIndex) => {
    if (action.tool === 'delete_manual_entry') {
      const entry = action.expected
      const date = new Date(entry.occurred_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      steps.push({ label: `Xóa khoản ${entry.type === 'INCOME' ? 'thu' : 'chi'} ${entry.amount.toLocaleString('vi-VN')} ₫ · ${date} · ${entry.category}`, meta: `Mã khoản: ${entry.id}`, status: 'needs' })
      return
    }
    if (action.tool === 'update_order_status') {
      const labels = { PAID: 'Đã thanh toán', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', AWAITING_PAYMENT: 'Chờ thanh toán' }
      steps.push({ label: `Đơn ${action.input.paymentCode}: ${labels[action.expected.status]} → ${labels[action.input.status]}`, status: 'needs' })
      return
    }
    if (action.tool === 'update_shop_settings') {
      steps.push({ label: `Tên cửa hàng: ${action.expected.name} → ${action.input.name}`, status: 'needs' })
      return
    }
    action.input.entries.forEach((entry, index) => {
      const prefix = `${actionIndex}:${index}`
      const label = `${entry.type === 'INCOME' ? 'Thu' : 'Chi'} ${entry.amount.toLocaleString('vi-VN')} ₫ · ${new Date(entry.occurredAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
      steps.push({ label, status: 'needs' })
      if (!entry.kind) questions.push({ id: `${prefix}:kind`, label: `${label}: phân loại`, options: entry.type === 'INCOME' ? ['Doanh thu kinh doanh', 'Tiền cá nhân', 'Chuyển tiền'] : ['Chi phí kinh doanh', 'Tiền cá nhân', 'Chuyển tiền'] })
      if (!entry.channel) questions.push({ id: `${prefix}:channel`, label: `${label}: kênh tiền`, options: Object.keys(channelOptions) })
    })
  })
  return { type: 'agentStep', stepId: randomUUID(), title: actions.every((action) => ['add_ledger_entries', 'delete_manual_entry'].includes(action.tool)) ? 'Thay đổi sổ thu chi' : 'Thay đổi dữ liệu', state: 'waiting', steps, ...(questions.length ? { questions } : {}), approveLabel: actions.every((action) => ['add_ledger_entries', 'delete_manual_entry'].includes(action.tool)) ? 'Duyệt và ghi sổ' : 'Duyệt thay đổi', undoNote: 'Hoàn tác sẽ khôi phục trạng thái trước khi duyệt.' }
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
