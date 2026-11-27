import type { LedgerChannel, LedgerEntry } from '@/lib/finance/types'

const channels: LedgerChannel[] = ['CASH', 'BANK', 'EWALLET']
const now = new Date()
const vietnamToday = new Date(now.getTime() + 7 * 3600000)
const year = vietnamToday.getUTCFullYear()
const month = vietnamToday.getUTCMonth()
const day = vietnamToday.getUTCDate()
const vnDate = (monthOffset: number, dayOfMonth: number) => new Date(Date.UTC(year, month + monthOffset, dayOfMonth, 3) - 7 * 3600000).toISOString()

/** Số dư mẫu có hiệu lực từ đầu ba tháng dữ liệu gần nhất. */
export const demoOpening = { asOf: new Date(Date.UTC(year, month - 2, 1) - 7 * 3600000).toISOString(), CASH: 10000000, BANK: 20000000 }

export function demoLedger(): LedgerEntry[] {
  return Array.from({ length: 72 }, (_, index) => {
    const monthOffset = Math.floor(index / 24) - 2
    const n = index % 24
    const maxDay = monthOffset === 0 ? day : 28
    const occurredAt = vnDate(monthOffset, Math.min(n + 1, maxDay))
    const kind = n % 8 === 0 ? 'PERSONAL' : n % 3 === 0 ? 'EXPENSE' : 'BUSINESS_REVENUE'
    const type = kind === 'EXPENSE' || (kind === 'PERSONAL' && n % 2 === 0) ? 'EXPENSE' : 'INCOME'
    return { id: `demo-ledger-${index}`, type, kind, channel: channels[(index + Math.floor(index / 3)) % channels.length], category: kind === 'BUSINESS_REVENUE' ? 'SALES' : kind === 'EXPENSE' ? (n % 2 ? 'ADS' : 'SHIPPING') : 'OTHER', documentRef: `${type === 'INCOME' ? 'PT' : 'PC'}-MAU-${String(index + 1).padStart(3, '0')}`, documentDate: occurredAt, industry: kind === 'BUSINESS_REVENUE' ? (n % 2 ? 'Bán hàng hóa' : 'Dịch vụ') : null, amount: kind === 'EXPENSE' ? 80000 + n * 5000 : kind === 'PERSONAL' ? 100000 + n * 5000 : 250000 + n * 10000, orderId: null, orderCode: null, note: kind === 'PERSONAL' ? 'Khoản cá nhân mẫu' : kind === 'EXPENSE' ? 'Chi phí kinh doanh mẫu' : 'Bán hàng mẫu', occurredAt, manual: false }
  })
}

export type InventoryMovement = { id: string; product: string; date: string; documentRef: string; direction: 'IN' | 'OUT'; quantity: number; unitPrice: number }
export const demoInventory: InventoryMovement[] = Array.from({ length: 18 }, (_, index) => {
  const product = ['Áo thun cơ bản', 'Túi vải', 'Bình giữ nhiệt'][index % 3]
  const monthOffset = Math.floor(index / 6) - 2
  const date = vnDate(monthOffset, monthOffset === 0 ? Math.min(index % 6 < 3 ? 1 : 2, day) : (index % 6 < 3 ? 3 : 15))
  return { id: `inventory-${index}`, product, date, documentRef: `${index % 6 < 3 ? 'PN' : 'PX'}-MAU-${index + 1}`, direction: index % 6 < 3 ? 'IN' : 'OUT', quantity: index % 6 < 3 ? 8 : 4, unitPrice: [120000, 70000, 180000][index % 3] }
})

/** Chứng từ giả định để minh họa mẫu, không suy ra nghĩa vụ thuế thực tế. */
export const demoTaxDocuments = [-2, -1, 0].map((offset, index) => ({ id: `tax-demo-${index}`, date: vnDate(offset, 1), ref: `THUE-MAU-${index + 1}`, quantity: 1, taxRate: 'Theo chứng từ mẫu', amount: 100000 }))
