import { z } from 'zod'
import { bookCodes } from '../../../lib/ledgerBooks.js'
import { getBook, getThreshold } from '../../finance/books.service.js'
import { findById } from '../../../repositories/shop/shop.repository.js'

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

export const ledgerBook = {
  name:'ledger_book',tier:'read',description:'Danh sách hoặc gợi ý mẫu sổ, xem trước, thông tin hộ, cột tự đặt và doanh thu lũy kế. Cột mới chỉ được điền sẵn để chủ cửa hàng tự thêm.',
  schema:z.object({action:z.enum(['list','suggest','preview','identity','columns','threshold']),code:z.enum(bookCodes).optional(),from:timestamp.optional(),to:timestamp.optional(),column:z.string().trim().min(1).max(80).optional()}).strict().refine((v)=>Boolean(v.from)===Boolean(v.to)),
  async run(input,ctx) {
    const code=input.code??'S1a-HKD',range=input.from?{from:input.from,to:input.to}:monthRange()
    if(input.action==='list' || input.action==='suggest') return {action:input.action,items:bookCodes.map((item)=>({code:item,name:names[item]}))}
    if(input.action==='identity') return {action:input.action,name:(await findById(ctx.shopId))?.name??'',note:'Chưa có nguồn mã số thuế và địa chỉ hộ.'}
    if(input.action==='columns') return {action:input.action,code,column:input.column??'',note:'Cột tự đặt chỉ lưu trong phiên trang Mẫu sổ; bạn kiểm tra và tự thêm.'}
    if(input.action==='threshold') return {action:input.action,...await getThreshold(ctx.shopId)}
    const book=await getBook(ctx.shopId,{code,...range})
    return {action:'preview',code,name:names[code],...range,count:book.count,warnings:book.warnings}
  },
}
