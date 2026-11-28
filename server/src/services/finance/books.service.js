import { getLedger } from './finance.service.js'
import { getSummary } from './ledger.service.js'
import { shopName } from '../../db/finance/ledger.js'

const add = (a, b) => { const value = a + b; if (!Number.isSafeInteger(value)) throw new Error('Unsafe book amount'); return value }
function section(title, entries) {
  const totals = { amount: 0, revenue: 0, expense: 0, cashIn: 0, cashOut: 0 }
  const rows = entries.map((entry) => {
    const revenue = entry.kind === 'BUSINESS_REVENUE' && entry.type === 'INCOME' ? entry.amount : null
    const expense = entry.kind === 'EXPENSE' && entry.type === 'EXPENSE' ? entry.amount : null
    const cashIn = entry.type === 'INCOME' ? entry.amount : null, cashOut = entry.type === 'EXPENSE' ? entry.amount : null
    for (const [key, value] of Object.entries({ amount: revenue, revenue, expense, cashIn, cashOut })) if (value !== null) totals[key] = add(totals[key], value)
    return { id: entry.id, channel: entry.channel, cells: { date: entry.occurredAt, description: entry.note || entry.orderCode || '', documentRef: entry.documentRef, documentDate: entry.documentDate, industry: entry.industry, amount: revenue, revenue, expense, cashIn, cashOut } }
  })
  const values = rows.length ? { ...totals, difference: entries.some((entry) => entry.kind === null) ? null : add(totals.revenue, -totals.expense) } : {}
  return { title, rows, totals: values, openingBalance: null, closingBalance: null }
}

export async function getBook(shopId, { code, from, to }) {
  const ledger = await getLedger(shopId, { from, to })
  const all = ledger.items, entries = all.filter((item) => item.kind !== 'PERSONAL' && item.kind !== 'TRANSFER').reverse()
  const warnings = ['Mẫu cần đối chiếu bản gốc; không dùng để kết luận nghĩa vụ thuế.']
  if (all.some((item) => item.kind === null)) warnings.push('Khoản chưa phân loại không tính là doanh thu hoặc chi phí kinh doanh.')
  if (all.some((item) => !item.documentRef || !item.documentDate)) warnings.push('Thiếu thông tin chứng từ; ô chưa có dữ liệu để trống.')
  let sections
  if (['S1a-HKD', 'S2a-HKD', 'S2b-HKD'].includes(code)) {
    const revenue = entries.filter((item) => item.type === 'INCOME' && item.kind === 'BUSINESS_REVENUE')
    if (code === 'S1a-HKD') sections = [section('', revenue)]
    else {
      const groups = new Map()
      for (const item of revenue) { const key = item.industry || 'Chưa có nhóm ngành'; groups.set(key, [...(groups.get(key) ?? []), item]) }
      sections = [...groups].map(([key, values]) => section(key, values)); if (!sections.length) sections = [section('Chưa có nhóm ngành', [])]
      warnings.push('Chưa có thuế suất và số thuế; các ô để trống.')
    }
  } else if (code === 'S2e-HKD') {
    sections = [section('Tiền mặt', entries.filter((item) => item.channel === 'CASH')), section('Tiền gửi không kỳ hạn', entries.filter((item) => item.channel === 'BANK'))]
    warnings.push('Chưa có số dư đầu kỳ; số dư cuối kỳ để trống. Khoản ví điện tử và chuyển tiền cần đối chiếu.')
  } else if (code === 'S2d-HKD' || code === 'S3a-HKD') {
    sections = [section('', [])]; warnings.push(code === 'S2d-HKD' ? 'Chưa có dữ liệu nhập, xuất, tồn.' : 'Chưa có dữ liệu nghĩa vụ thuế khác.')
  } else sections = [section('', entries)]
  if (!sections.some((part) => part.rows.length)) warnings.push('Không có dữ liệu phù hợp trong kỳ.')
  return { from, to, sections, warnings, updatedAt: ledger.updatedAt, source: 'sổ thu chi', shopName: await shopName(shopId), count: sections.reduce((sum, part) => sum + part.rows.length, 0) }
}

export async function getThreshold(shopId) {
  const now = new Date(), year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now))
  const from = new Date(Date.UTC(year, 0, 1) - 7 * 3600000).toISOString(), to = now.toISOString()
  const summary = await getSummary(shopId, { from, to })
  return { year, revenue: summary.revenue, threshold: 1000000000, updatedAt: to, source: 'sổ thu chi' }
}
