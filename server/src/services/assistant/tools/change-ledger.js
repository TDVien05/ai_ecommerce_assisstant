import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { appError } from '../../../errors/index.js'
import * as ledger from '../../../repositories/finance/ledgerEntry.repository.js'
import { entry } from './finance.write.js'
const clone = (value) => JSON.parse(JSON.stringify(value))
const conflict = () => appError('STEP_CONFLICT', 'Dữ liệu đã thay đổi; không thể thực hiện thao tác.')
const missing = (code) => appError(code)
export const patchSchema = entry.partial().strict().refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường.')
export const column = { occurredAt: 'occurred_at', documentRef: 'document_ref', documentDate: 'document_date' }
const patchRow = (row, data) => { const next = { ...row }; for (const [key, value] of Object.entries(data)) next[column[key] ?? key] = value; return next }
const validRow = (row) => !(row.type === 'INCOME' && row.kind === 'EXPENSE') && !(row.type === 'EXPENSE' && row.kind === 'BUSINESS_REVENUE')
const classificationOnly = (data) => Object.keys(data).every((key)=>['kind','channel'].includes(key))
const nonManual = () => appError('ENTRY_NOT_MANUAL', 'Khoản tự động chỉ được thay đổi phân loại và kênh tiền.')

export const editLedger = {
  name: 'edit_manual_entry', schema: z.object({ entryId: z.string().uuid(), data: patchSchema }).strict(),
  async propose(input, ctx) {
    const row = await ledger.findEntry(ctx.shopId, input.entryId)
    if (!row) throw missing('ENTRY_NOT_FOUND')
    if (!row.manual && !classificationOnly(input.data)) throw nonManual()
    const next = patchRow(clone(row), input.data)
    if (!validRow(next)) throw appError('BAD_REQUEST', 'Phân loại khoản sổ không hợp lệ.')
    return { tool: this.name, input, expected: clone(row) }
  },
  async apply(client, input, ctx, expected) {
    const row = await ledger.findEntry(ctx.shopId, input.entryId, client, true)
    if (!row || !isDeepStrictEqual(clone(row), expected)) throw conflict()
    if (!row.manual && !classificationOnly(input.data)) throw nonManual()
    const next = patchRow(clone(row), input.data)
    if (!validRow(next)) throw appError('BAD_REQUEST', 'Phân loại khoản sổ không hợp lệ.')
    const after = row.manual ? await ledger.updateManualEntry(ctx.shopId, input.entryId, next, client) : await ledger.classifyEntry(ctx.shopId,input.entryId,next,client)
    if (!after) throw conflict()
    return { before: { entries: [clone(row)] }, after: { entries: [clone(after)] } }
  },
  async revert(client, log, ctx) {
    const before = log.before.entries[0], after = log.after.entries[0]
    const row = await ledger.findEntry(ctx.shopId, after.id, client, true)
    if (!row || !isDeepStrictEqual(clone(row), after)) throw conflict()
    const restored=row.manual ? await ledger.updateManualEntry(ctx.shopId,after.id,before,client) : await ledger.classifyEntry(ctx.shopId,after.id,before,client)
    if (!restored) throw conflict()
  },
}
