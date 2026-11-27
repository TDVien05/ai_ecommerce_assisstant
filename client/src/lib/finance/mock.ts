import { ApiError } from '@/lib/api'
import { notifyLedger, respond, store } from '@/lib/mockServer/store'
import type { CreateLedgerEntry, LedgerEntry, LedgerType } from './types'

export const mockFinance = {
  async ledger(query: { from?: string; to?: string; type?: LedgerType } = {}) {
    const items = store.entries.filter((entry) => (!query.from || entry.occurredAt >= query.from) && (!query.to || entry.occurredAt < query.to) && (!query.type || entry.type === query.type)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    const income = items.filter((e) => e.type === 'INCOME').reduce((sum, e) => sum + e.amount, 0)
    const expense = items.filter((e) => e.type === 'EXPENSE').reduce((sum, e) => sum + e.amount, 0)
    return respond({ items, totals: { income, expense, net: income - expense }, updatedAt: new Date().toISOString() })
  },
  async createEntry(body: CreateLedgerEntry) {
    if (!Number.isSafeInteger(body.amount) || body.amount <= 0 || !Number.isFinite(Date.parse(body.occurredAt))) throw new ApiError(400, 'BAD_REQUEST', 'Kiểm tra số tiền và ngày ghi sổ.')
    const entry: LedgerEntry = { ...body, id: crypto.randomUUID(), orderId: null, orderCode: null, manual: true }
    store.entries.push(entry)
    notifyLedger()
    return respond({ entry, message: body.type === 'INCOME' ? 'Đã ghi khoản thu.' : 'Đã ghi khoản chi.' })
  },
  async deleteEntry(id: string) {
    const entry = store.entries.find((item) => item.id === id)
    if (!entry) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Không tìm thấy khoản thu chi.')
    if (!entry.manual) throw new ApiError(409, 'ENTRY_NOT_MANUAL', 'Không thể xóa khoản thu chi tự động.')
    store.entries = store.entries.filter((item) => item.id !== id)
    notifyLedger()
    return respond({ message: 'Đã xóa khoản thu chi.' })
  },
}
