import { z } from 'zod'
import { getSummary, listLedger } from '../../ledger.service.js'

const date = z.string().describe('ISO 8601 với múi giờ')
export const tools = [
  { name: 'get_summary', tier: 'read', description: 'Tổng doanh thu và chi phí đã phân loại trong kỳ; from gồm, to không gồm.', schema: z.object({ from: date, to: date }).strict(), run: (input, ctx) => getSummary(ctx.shopId, input) },
  { name: 'list_ledger', tier: 'read', description: 'Danh sách khoản sổ trong kỳ; from gồm, to không gồm.', schema: z.object({ from: date, to: date, type: z.enum(['INCOME', 'EXPENSE']).optional() }).strict(), run: (input, ctx) => listLedger(ctx.shopId, input) },
]
