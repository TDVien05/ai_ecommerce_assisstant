import { z } from 'zod'
import { getSummary, listLedger, getActivity } from '../../finance/ledger.service.js'

const date = z.string().describe('ISO 8601 với múi giờ')
export const tools = [
  { name: 'get_summary', tier: 'read', description: 'Tổng doanh thu và chi phí đã phân loại trong kỳ; from gồm, to không gồm.', schema: z.object({ from: date, to: date }).strict(), run: (input, ctx) => getSummary(ctx.shopId, input) },
  { name: 'list_ledger', tier: 'read', description: 'Danh sách khoản sổ trong kỳ; from gồm, to không gồm.', schema: z.object({ from: date, to: date, type: z.enum(['INCOME', 'EXPENSE']).optional() }).strict(), run: (input, ctx) => listLedger(ctx.shopId, input) },
  { name: 'get_activity', tier: 'read', description: 'Đếm giao dịch thu chi và đơn tạo trong kỳ; dùng khi hỏi bao nhiêu giao dịch hoặc hôm nay có gì. Không dùng cho giao dịch ngân hàng chưa đối soát.', schema: z.object({ from: date, to: date }).strict(), run: (input, ctx) => getActivity(ctx.shopId, input) },
]
