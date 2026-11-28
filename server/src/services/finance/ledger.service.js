import * as ledgerRepo from '../../repositories/finance/ledgerEntry.repository.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import { badRequest } from '../../errors/index.js'

function period({ from, to }) {
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/
  if (!iso.test(from) || !iso.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw badRequest('Khoảng thời gian không hợp lệ.')
}
function money(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new Error('Ledger amount exceeds safe integer range')
  return number
}

export async function getSummary(shopId, input) {
  period(input)
  const row = await ledgerRepo.periodSummary(shopId, input.from, input.to)
  const revenue = money(row.revenue), expenses = money(row.expenses)
  const difference = money(revenue - expenses)
  return { revenue, expenses, difference, totalCount: row.total_count, unknownCount: row.unknown_count, classifiedCount: row.classified_count, from: input.from, to: input.to }
}
export async function listLedger(shopId, input) {
  period(input)
  if (input.type && !['INCOME', 'EXPENSE'].includes(input.type)) throw badRequest('Loại khoản sổ không hợp lệ.')
  const [rows,unknownCount] = await Promise.all([ledgerRepo.listPeriod(shopId, input.from, input.to, input.type),ledgerRepo.unclassifiedInPeriod(shopId,input.from,input.to)])
  const items = rows.slice(0, 100).map((row) => ({ id: row.id, type: row.type, kind: row.kind, category: row.category, amount: money(row.amount), note: row.note, occurredAt: row.occurred_at.toISOString() }))
  let income = 0, expense = 0
  for (const item of items) {
    if (item.type === 'INCOME') income = money(income + item.amount)
    else expense = money(expense + item.amount)
  }
  return { items, totals: { income, expense }, from: input.from, to: input.to, limited: rows.length > 100, unknownCount }
}

export async function getActivity(shopId, input) {
  period(input)
  const data = { ledger: await ledgerRepo.activityByType(shopId, input.from, input.to), orders: await orderRepo.activityByStatus(shopId, input.from, input.to) }
  const entry = (type) => { const row = data.ledger.find((item) => item.type === type); return { count: row?.count ?? 0, amount: money(row?.amount ?? 0) } }
  const orders = data.orders.map((row) => ({ status: row.status, count: row.count, amount: money(row.amount) }))
  const orderTotal = orders.reduce((sum, row) => ({ count: money(sum.count + row.count), amount: money(sum.amount + row.amount) }), { count: 0, amount: 0 })
  return { from: input.from, to: input.to, income: entry('INCOME'), expense: entry('EXPENSE'), orders, orderTotal }
}
