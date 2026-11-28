import { z } from 'zod'
import { bookCodes } from '../../../lib/ledgerBooks.js'
import { getBook } from '../../finance/books.service.js'

const names = { 'S1a-HKD': 'Sổ doanh thu bán hàng hóa, dịch vụ', 'S2a-HKD': 'Sổ doanh thu bán hàng hóa, dịch vụ', 'S2b-HKD': 'Sổ doanh thu bán hàng hóa, dịch vụ', 'S2c-HKD': 'Sổ chi tiết doanh thu, chi phí', 'S2d-HKD': 'Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hóa', 'S2e-HKD': 'Sổ chi tiết tiền', 'S3a-HKD': 'Sổ theo dõi nghĩa vụ thuế khác' }
function monthRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year').value), month = Number(parts.find((p) => p.type === 'month').value)
  return { from: new Date(Date.UTC(year, month - 1, 1) - 7 * 3600000).toISOString(), to: new Date(Date.UTC(year, month, 1) - 7 * 3600000).toISOString() }
}
const timestamp = z.string().datetime({ offset: true })
export const exportBook = {
  name: 'export_ledger_book', tier: 'read', description: 'Chuẩn bị tải mẫu sổ PDF hoặc Excel; mặc định S1a-HKD và tháng hiện tại.',
  schema: z.object({ code: z.enum(bookCodes).optional(), from: timestamp.optional(), to: timestamp.optional() }).strict().refine((v) => Boolean(v.from) === Boolean(v.to), 'Cần cả ngày bắt đầu và ngày kết thúc.'),
  run: async (input, ctx) => {
    const code = input.code ?? 'S1a-HKD', range = input.from ? { from: input.from, to: input.to } : monthRange()
    const book = await getBook(ctx.shopId, { code, ...range })
    return { code, name: names[code], ...range, count: book.count, warnings: book.warnings }
  },
}
