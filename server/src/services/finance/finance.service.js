import { withTransaction } from '../../db/pool.js'
import { HttpError } from '../../lib/httpError.js'
import * as read from '../../db/finance/finance.js'
import * as write from '../../db/finance/ledger.write.js'

const invalid = () => new HttpError(400, 'BAD_REQUEST', 'Thông tin khoản sổ không hợp lệ.')
const incomplete = () => new HttpError(409, 'FINANCE_INCOMPLETE', 'Dữ liệu chưa đủ để tính báo cáo. Vui lòng phân loại khoản sổ và bổ sung giá vốn.')
const missing = () => new HttpError(404, 'ENTRY_NOT_FOUND', 'Không tìm thấy khoản thu chi.')
const nonManual = () => new HttpError(409, 'ENTRY_NOT_MANUAL', 'Không thể xóa khoản thu chi tự động.')
function money(value) {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new Error('Unsafe integer in finance data')
  return result
}
function validatePeriod({ from, to }) { if (from && to && Date.parse(from) >= Date.parse(to)) throw invalid() }
function toEntry(row) {
  return { id: row.id, type: row.type, kind: row.kind, channel: row.channel, category: row.category, documentRef: row.document_ref, documentDate: row.document_date ? new Date(row.document_date).toISOString().slice(0, 10) : null, industry: row.industry, amount: money(row.amount), orderId: row.order_id, orderCode: row.order_code ?? null, note: row.note, occurredAt: new Date(row.occurred_at).toISOString(), manual: row.manual }
}
function checkKind(input) {
  if ((input.type === 'INCOME' && input.kind === 'EXPENSE') || (input.type === 'EXPENSE' && input.kind === 'BUSINESS_REVENUE')) throw invalid()
}

export async function getLedger(shopId, query) {
  validatePeriod(query)
  const rows = await read.ledger(shopId, query)
  let income = 0, expense = 0
  for (const row of rows) { if (row.type === 'INCOME') income = money(income + money(row.amount)); else expense = money(expense + money(row.amount)) }
  return { items: rows.map(toEntry), totals: { income, expense, net: money(income - expense) }, updatedAt: new Date().toISOString() }
}

export async function createEntry(shopId, input) {
  checkKind(input)
  const row = await write.createEntry(shopId, input)
  return { entry: toEntry(row), message: 'Đã ghi khoản thu chi.' }
}

export async function deleteEntry(shopId, id) {
  return withTransaction(async (client) => {
    const row = await write.findEntry(shopId, id, client, true)
    if (!row) throw missing()
    if (!row.manual) throw nonManual()
    await write.removeEntry(shopId, id, client)
    return { message: 'Đã xóa khoản thu chi.' }
  })
}

async function complete(shopId, query, requireCost = false) {
  validatePeriod(query)
  const counts = await read.counts(shopId, query)
  if (!counts.total || counts.unknown || (requireCost && counts.missing_cost)) throw incomplete()
}
export async function getSummary(shopId, query) {
  await complete(shopId, query, true)
  const row = await read.summary(shopId, query)
  if (row.missing_items) throw incomplete()
  const revenue = money(row.revenue), cost = money(row.cost), expenses = money(row.expenses), orderRevenue = money(row.order_revenue)
  const grossProfit = money(revenue - cost)
  return { revenue, cost, grossProfit, expenses, netProfit: money(grossProfit - expenses), orderCount: row.order_count, aov: row.order_count ? money(Math.round(orderRevenue / row.order_count)) : 0 }
}
export async function getTimeseries(shopId, query) {
  await complete(shopId, query)
  return { points: (await read.timeseries(shopId, query)).map((row) => ({ date: row.date, revenue: money(row.revenue) })) }
}
export async function getTopProducts(shopId, query) {
  await complete(shopId, query)
  return { items: (await read.topProducts(shopId, query)).map((row) => ({ productId: row.product_id, name: row.name, quantity: money(row.quantity), revenue: money(row.revenue) })) }
}
