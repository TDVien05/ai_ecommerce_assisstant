import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as orders from '../../../repositories/orders/order.repository.js'
import { entry, addLedgerEntries, deleteManualEntry, channelOptions } from './finance.write.js'
import { updateOrderStatus } from './orders.js'
import { updateShop } from './shop.js'
import { editLedger, patchSchema, column } from './change-ledger.js'
import { changeAlert } from './change-alert.js'
const missing = (code) => appError(code)

const date = (value) => new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
const statusLabels = { PAID: 'Đã thanh toán', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', AWAITING_PAYMENT: 'Chờ thanh toán' }
addLedgerEntries.entity = deleteManualEntry.entity = editLedger.entity = 'ledger'
updateOrderStatus.entity = 'orders'
updateShop.entity = 'shop'
changeAlert.entity = 'alerts'
addLedgerEntries.describe = (action, index) => {
  const steps = [], questions = []
  action.input.entries.forEach((item, i) => {
    const prefix = `${index}:${i}`, label = `${item.type === 'INCOME' ? 'Thu' : 'Chi'} ${item.amount.toLocaleString('vi-VN')} ₫ · ${date(item.occurredAt)}`
    steps.push({ label, ...(item.note ? { meta: item.note } : {}), status: 'needs' })
    if (!item.kind) questions.push({ id: `${prefix}:kind`, label: `${label}: phân loại`, options: item.type === 'INCOME' ? ['Doanh thu kinh doanh', 'Tiền cá nhân', 'Chuyển tiền'] : ['Chi phí kinh doanh', 'Tiền cá nhân', 'Chuyển tiền'] })
    if (!item.channel) questions.push({ id: `${prefix}:channel`, label: `${label}: kênh tiền`, options: Object.keys(channelOptions) })
  })
  return { steps, questions }
}
deleteManualEntry.describe = ({ expected: item }) => ({ steps: [{ label: `Xóa khoản ${item.type === 'INCOME' ? 'thu' : 'chi'} ${item.amount.toLocaleString('vi-VN')} ₫ · ${date(item.occurred_at)} · ${item.category}`, meta: `Mã khoản: ${item.id}`, status: 'needs' }] })
updateOrderStatus.describe = (action) => ({ steps: [{ label: `Đơn ${action.input.paymentCode}: ${statusLabels[action.expected.status]} → ${statusLabels[action.input.status]}`, status: 'needs' }] })
updateShop.describe = (action) => ({ steps: [{ label: `Tên cửa hàng: ${action.expected.name} → ${action.input.name}`, status: 'needs' }] })
changeAlert.describe = (action) => ({ steps: [{ label: `Cảnh báo ${action.expected.title}: Đang mở → ${action.input.status === 'HELD' ? 'Đã giữ' : 'Đã bỏ qua'}`, status: 'needs' }] })
editLedger.describe = (action) => {
  const names = { type:'Loại', kind:'Phân loại', channel:'Kênh tiền', category:'Nhóm', amount:'Số tiền', occurredAt:'Ngày', note:'Ghi chú', documentRef:'Chứng từ', documentDate:'Ngày chứng từ', industry:'Ngành' }
  const changes = Object.entries(action.input.data).map(([key, value]) => `${names[key]}: ${action.expected[column[key] ?? key] ?? '—'} → ${value ?? '—'}`).join('; ')
  return { steps: [{ label: `Sửa khoản ${action.input.entryId}`, meta: changes, status: 'needs' }] }
}

// Historical tool names remain available for pending steps and existing audit logs.
export const changeTools = [addLedgerEntries, deleteManualEntry, editLedger, updateOrderStatus, updateShop, changeAlert]
export const changeToolByName = new Map(changeTools.map((tool) => [tool.name, tool]))
const operation = z.union([
  z.object({ entity: z.literal('ledger'), action: z.literal('create'), data: entry }).strict(),
  z.object({ entity: z.literal('ledger'), action: z.literal('update'), id: z.string().uuid(), data: patchSchema }).strict(),
  z.object({ entity: z.literal('ledger'), action: z.literal('delete'), id: z.string().uuid() }).strict(),
  z.object({ entity: z.literal('orders'), action: z.literal('update'), id: z.string().uuid(), data: z.object({ status: z.enum(['SHIPPING', 'COMPLETED', 'CANCELLED']) }).strict() }).strict(),
  z.object({ entity: z.literal('alerts'), action: z.literal('update'), id: z.string().uuid(), data: z.object({ status: z.enum(['HELD', 'DISMISSED']) }).strict() }).strict(),
  z.object({ entity: z.literal('shop'), action: z.literal('update'), data: z.object({ name: z.string().trim().min(1).max(120) }).strict() }).strict(),
])

export const proposeChange = {
  name: 'propose_change', tier: 'write',
  description: 'Đề xuất tối đa 20 thay đổi chờ duyệt: ledger create/update/delete, orders update trạng thái, alerts update trạng thái, shop update tên. Dùng id của dữ liệu cửa hàng; không xác nhận thanh toán.',
  schema: z.object({ changes: z.array(operation).min(1).max(20) }).strict(),
  async propose(input, ctx) {
    const actions = [], seen = new Set()
    for (const change of input.changes) {
      const key = change.id ? `${change.entity}:${change.id}` : change.entity === 'shop' ? 'shop' : null
      if (key && seen.has(key)) throw appError('BAD_REQUEST', 'Không thể thay đổi cùng một đối tượng hai lần trong một đề xuất.')
      if (key) seen.add(key)
      let tool, args
      if (change.entity === 'ledger' && change.action === 'create') { tool = addLedgerEntries; args = { entries: [change.data] } }
      else if (change.entity === 'ledger' && change.action === 'update') { tool = editLedger; args = { entryId: change.id, data: change.data } }
      else if (change.entity === 'ledger') { tool = deleteManualEntry; args = { entryId: change.id } }
      else if (change.entity === 'orders') {
        const row = await orders.findViewById(ctx.shopId, change.id)
        if (!row) throw missing('ORDER_NOT_FOUND')
        tool = updateOrderStatus; args = { paymentCode: row.payment_code, status: change.data.status }
      } else if (change.entity === 'alerts') { tool = changeAlert; args = { id: change.id, status: change.data.status } }
      else { tool = updateShop; args = change.data }
      actions.push(await tool.propose(args, ctx))
    }
    return actions
  },
}
