import { ApiError } from '@/lib/api'
import { respond, store } from '@/lib/mockServer/store'
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
    return respond({ entry, message: body.type === 'INCOME' ? 'Đã ghi khoản thu.' : 'Đã ghi khoản chi.' })
  },
  async deleteEntry(id: string) {
    const entry = store.entries.find((item) => item.id === id)
    if (!entry) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Không tìm thấy khoản thu chi.')
    if (!entry.manual) throw new ApiError(409, 'ENTRY_NOT_MANUAL', 'Không thể xóa khoản thu chi tự động.')
    store.entries = store.entries.filter((item) => item.id !== id)
    return respond({ message: 'Đã xóa khoản thu chi.' })
  },
  async summary(query: { from?: string; to?: string } = {}) {
    const { items } = await this.ledger(query)
    const sales = items.filter((entry) => entry.type === 'INCOME' && entry.category === 'SALES')
    const revenue = sales.reduce((sum, entry) => sum + entry.amount, 0)
    const expenses = items.filter((entry) => entry.type === 'EXPENSE').reduce((sum, entry) => sum + entry.amount, 0)
    const orderIds = [...new Set(sales.map((entry) => entry.orderId).filter((id): id is string => id !== null))]
    const cost = orderIds.reduce((sum, id) => sum + (store.orderCosts[id] ?? 0), 0)
    const grossProfit = revenue - cost
    const orderRevenue = sales.filter((entry) => entry.orderId !== null).reduce((sum, entry) => sum + entry.amount, 0)
    return respond({ revenue, cost, grossProfit, expenses, netProfit: grossProfit - expenses, orderCount: orderIds.length, aov: orderIds.length ? Math.round(orderRevenue / orderIds.length) : 0 })
  },
  async timeseries(query: { from?: string; to?: string } = {}) {
    const { items } = await this.ledger(query)
    const byDay = new Map<string, number>()
    for (const entry of items.filter((item) => item.type === 'INCOME' && item.category === 'SALES')) {
      const date = entry.occurredAt.slice(0, 10)
      byDay.set(date, (byDay.get(date) ?? 0) + entry.amount)
    }
    return respond({ points: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({ date, revenue })) })
  },
  async topProducts(query: { from?: string; to?: string; limit?: number } = {}) {
    const { items } = await this.ledger(query)
    const orderIds = new Set(items.filter((entry) => entry.type === 'INCOME' && entry.category === 'SALES').map((entry) => entry.orderId))
    const products = new Map<string, { productId: string; name: string; quantity: number; revenue: number }>()
    for (const order of store.orders.filter((item) => orderIds.has(item.id))) for (const item of order.items) {
      const existing = products.get(item.name) ?? { productId: item.name, name: item.name, quantity: 0, revenue: 0 }
      existing.quantity += item.quantity; existing.revenue += item.lineTotal; products.set(item.name, existing)
    }
    return respond({ items: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, query.limit ?? 5) })
  },
}
