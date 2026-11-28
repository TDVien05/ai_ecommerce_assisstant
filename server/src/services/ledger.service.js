import * as db from '../db/ledger.js'
import { badRequest } from '../lib/httpError.js'

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
  const row = await db.summary(shopId, input.from, input.to)
  const revenue = money(row.revenue), expenses = money(row.expenses)
  const difference = money(revenue - expenses)
  return { revenue, expenses, difference, totalCount: row.total_count, unknownCount: row.unknown_count, classifiedCount: row.classified_count, from: input.from, to: input.to }
}
export async function listLedger(shopId, input) {
  period(input)
  if (input.type && !['INCOME', 'EXPENSE'].includes(input.type)) throw badRequest('Loại khoản sổ không hợp lệ.')
  const rows = await db.list(shopId, input.from, input.to, input.type)
  return { items: rows.map((row) => ({ id: row.id, type: row.type, kind: row.kind, category: row.category, amount: money(row.amount), note: row.note, occurredAt: row.occurred_at.toISOString() })), from: input.from, to: input.to, limited: rows.length === 100 }
}
