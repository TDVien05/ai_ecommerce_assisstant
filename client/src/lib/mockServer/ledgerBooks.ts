import { ApiError } from '@/lib/api'
import { store, respond } from './store'
import { templates } from '@/lib/ledgerTemplates/config'
import type { BookRow, BookSection, Field, LedgerBook, Template, TemplateCode, Threshold } from '@/lib/ledgerTemplates/types'
import type { LedgerEntry } from '@/lib/finance/types'

function row(entry: LedgerEntry): BookRow {
  return { id: entry.id, channel: entry.channel, cells: {
    date: entry.occurredAt, description: entry.note || entry.orderCode || '', documentRef: entry.documentRef, documentDate: entry.documentDate, industry: entry.industry,
    amount: entry.kind === 'BUSINESS_REVENUE' ? entry.amount : null,
    revenue: entry.kind === 'BUSINESS_REVENUE' ? entry.amount : null,
    expense: entry.kind === 'EXPENSE' ? entry.amount : null,
    cashIn: entry.type === 'INCOME' ? entry.amount : null,
    cashOut: entry.type === 'EXPENSE' ? entry.amount : null,
  } }
}
function section(title: string, rows: BookRow[], template: Template): BookSection {
  const totals: Partial<Record<Field, number | null>> = {}
  for (const column of template.columns.filter((item) => item.total && item.key !== 'difference')) totals[column.key] = rows.reduce((sum, item) => sum + (typeof item.cells[column.key] === 'number' ? item.cells[column.key] as number : 0), 0)
  if (template.columns.some((column) => column.key === 'difference')) totals.difference = (totals.revenue ?? 0) - (totals.expense ?? 0)
  return { title, rows, totals, openingBalance: null, closingBalance: null }
}
export async function listTemplates() { return respond({ items: templates }) }
export async function getBook(code: TemplateCode, from: string, to: string): Promise<LedgerBook> {
  const template = templates.find((item) => item.code === code)
  if (!template) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Không tìm thấy mẫu sổ.')
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from >= to) throw new ApiError(400, 'INVALID_PERIOD', 'Kỳ xem sổ không hợp lệ.')
  let entries = store.entries.filter((entry) => entry.occurredAt >= from && entry.occurredAt < to && entry.kind !== 'PERSONAL' && entry.kind !== 'TRANSFER')
  if (template.filter === 'revenue') entries = entries.filter((entry) => entry.kind === 'BUSINESS_REVENUE')
  if (template.filter === 'unavailable') entries = []
  entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const warnings = [template.note]
  if (entries.some((entry) => !entry.documentRef || !entry.documentDate) && template.columns.some((column) => column.key === 'documentRef')) warnings.push('Một số chứng từ chưa có số hiệu hoặc ngày; các ô tương ứng được để trống.')
  let sections: BookSection[]
  if (template.filter === 'money') {
    sections = [section('Tiền mặt', entries.filter((item) => item.channel === 'CASH').map(row), template), section('Tiền gửi không kỳ hạn', entries.filter((item) => item.channel === 'BANK').map(row), template)]
    if (entries.some((entry) => entry.channel === 'EWALLET')) warnings.push('Khoản qua ví điện tử chưa được đưa vào mẫu S2e; cần phân loại theo hồ sơ thực tế.')
    if (store.entries.some((entry) => entry.occurredAt >= from && entry.occurredAt < to && entry.kind === 'TRANSFER')) warnings.push('Khoản chuyển tiền chưa được đưa vào sổ; cần đối chiếu chứng từ thực tế.')
    warnings.push('Chưa có số dư đầu kỳ nên số dư cuối kỳ để trống.')
  } else if (code === 'S2a-HKD' || code === 'S2b-HKD') {
    const groups = new Map<string, BookRow[]>()
    for (const entry of entries) { const name = entry.industry || 'Chưa có nhóm ngành'; groups.set(name, [...(groups.get(name) ?? []), row(entry)]) }
    sections = [...groups].map(([name, rows]) => section(name, rows, template))
    if (!sections.length) sections = [section('Chưa có nhóm ngành', [], template)]
    if (entries.some((entry) => !entry.industry)) warnings.push('Chưa có nhóm ngành cho một số khoản; cần bổ sung trước khi dùng sổ.')
    warnings.push('Chưa có dữ liệu thuế suất và số thuế; các dòng thuế để trống.')
  } else sections = [section('', entries.map(row), template)]
  return respond({ template, from, to, sections, warnings, updatedAt: new Date().toISOString(), source: 'sổ thu chi giả lập' })
}
export async function getThreshold(now = new Date()): Promise<Threshold> {
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now))
  const start = new Date(Date.UTC(year, 0, 1) - 7 * 60 * 60 * 1000)
  const entries = store.entries.filter((entry) => entry.kind === 'BUSINESS_REVENUE' && new Date(entry.occurredAt) >= start && new Date(entry.occurredAt) <= now)
  const revenue = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const threshold = 1000000000
  return respond({ year, revenue, threshold, updatedAt: now.toISOString(), source: 'sổ thu chi giả lập' })
}
