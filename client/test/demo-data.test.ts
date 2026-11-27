import { test } from 'node:test'
import assert from 'node:assert/strict'

const values = new Map<string, string>()
Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } })
const { store, syncManualLedger } = await import('../src/lib/mockServer/store')
const { mockFinance } = await import('../src/lib/finance/mock')
const { getBook } = await import('../src/lib/mockServer/ledgerBooks')
const { demoOpening } = await import('../src/lib/mockServer/demoData')

test('dữ liệu mẫu có ba tháng và phân loại đầy đủ', () => {
  assert.equal(store.entries.length, 74)
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' })
  assert.equal(new Set(store.entries.filter((item) => item.id.startsWith('demo-ledger-')).map((item) => month.format(new Date(item.occurredAt)))).size, 3)
  for (const channel of ['CASH', 'BANK', 'EWALLET']) assert.ok(store.entries.some((entry) => entry.channel === channel))
  for (const kind of ['BUSINESS_REVENUE', 'EXPENSE', 'PERSONAL']) assert.ok(store.entries.some((entry) => entry.kind === kind))
  assert.ok(store.entries.some((entry) => entry.documentRef && entry.industry))
})

test('doanh thu loại tiền cá nhân; tồn kho và số dư khớp giao dịch', async () => {
  const to = new Date(Date.now() + 86400000).toISOString()
  const revenue = await getBook('S1a-HKD', demoOpening.asOf, to)
  const expected = store.entries.filter((entry) => entry.kind === 'BUSINESS_REVENUE' && entry.occurredAt >= demoOpening.asOf && entry.occurredAt < to).reduce((sum, entry) => sum + entry.amount, 0)
  assert.equal(revenue.sections[0].totals.amount, expected)
  const money = await getBook('S2e-HKD', demoOpening.asOf, to)
  assert.equal(money.sections[0].openingBalance, demoOpening.CASH)
  assert.equal(money.sections[1].openingBalance, demoOpening.BANK)
  for (const section of money.sections) assert.equal(section.closingBalance, section.openingBalance! + (section.totals.cashIn ?? 0) - (section.totals.cashOut ?? 0))
  const inventory = await getBook('S2d-HKD', demoOpening.asOf, to)
  assert.equal(inventory.sections.length, 3)
  for (const section of inventory.sections) {
    let quantity = 0
    for (const row of section.rows) { quantity += Number(row.cells.quantityIn ?? 0) - Number(row.cells.quantityOut ?? 0); assert.equal(row.cells.quantityBalance, quantity); assert.ok(quantity >= 0) }
    assert.equal(section.totals.quantityIn, section.rows.reduce((sum, row) => sum + Number(row.cells.quantityIn ?? 0), 0))
  }
  const tax = await getBook('S3a-HKD', demoOpening.asOf, to)
  assert.equal(tax.sections[0].rows.length, 3)
  assert.match(tax.warnings[0], /minh họa/)
})

test('khoản nhập tay được lưu và hoàn tác; lỗi lưu không ghi giả thành công', async () => {
  const created = await mockFinance.createEntry({ type: 'INCOME', kind: 'PERSONAL', channel: 'CASH', category: 'OTHER', documentRef: null, documentDate: null, industry: null, amount: 123000, note: 'Kiểm tra', occurredAt: new Date().toISOString() })
  store.entries = store.entries.filter((entry) => entry.id !== created.entry.id)
  syncManualLedger()
  assert.ok(store.entries.some((entry) => entry.id === created.entry.id))
  await mockFinance.deleteEntry(created.entry.id)
  syncManualLedger()
  assert.ok(!store.entries.some((entry) => entry.id === created.entry.id))
  values.set('flowy-demo-manual-ledger-v1', '{invalid')
  await assert.rejects(() => mockFinance.ledger(), /không hợp lệ/)
  values.clear()
})
