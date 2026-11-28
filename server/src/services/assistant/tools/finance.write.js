import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { HttpError } from '../../../lib/httpError.js'
import * as db from '../../../db/ledger.write.js'

export const kindOptions = { 'Doanh thu kinh doanh': 'BUSINESS_REVENUE', 'Chi phí kinh doanh': 'EXPENSE', 'Tiền cá nhân': 'PERSONAL', 'Chuyển tiền': 'TRANSFER' }
export const channelOptions = { 'Tiền mặt': 'CASH', 'Ngân hàng': 'BANK', 'Ví điện tử': 'EWALLET' }
const entry = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  kind: z.enum(['BUSINESS_REVENUE', 'PERSONAL', 'EXPENSE', 'TRANSFER']).nullable().optional(),
  channel: z.enum(['CASH', 'BANK', 'EWALLET']).nullable().optional(),
  category: z.enum(['SALES', 'SHIPPING', 'ADS', 'INVENTORY', 'OTHER']).optional(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.string().datetime({ offset: true }),
  note: z.string().max(500).nullable().optional(),
  documentRef: z.string().max(120).nullable().optional(),
  documentDate: z.string().date().nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
}).strict()

const conflict = () => new HttpError(409, 'STEP_CONFLICT', 'Khoản sổ đã thay đổi; không thể thực hiện thao tác.')
const missing = () => new HttpError(404, 'ENTRY_NOT_FOUND', 'Không tìm thấy khoản thu chi.')
const manualOnly = () => new HttpError(409, 'ENTRY_NOT_MANUAL', 'Không thể xóa khoản thu chi tự động.')
const normalize = (row) => JSON.parse(JSON.stringify(row))
const same = (left, right) => isDeepStrictEqual(normalize(left), right)

export const addLedgerEntries = {
  name: 'add_ledger_entries', tier: 'write', description: 'Đề xuất ghi các khoản thu hoặc chi; chưa ghi cho đến khi được duyệt.',
  schema: z.object({ entries: z.array(entry).min(1).max(20) }).strict(),
  async propose(input) { return { tool: 'add_ledger_entries', input } },
  async apply(client, input, ctx) {
    const rows = []
    for (const item of input.entries) {
      if (!item.kind || !item.channel || (item.type === 'INCOME' && item.kind === 'EXPENSE') || (item.type === 'EXPENSE' && item.kind === 'BUSINESS_REVENUE')) throw new HttpError(400, 'BAD_REQUEST', 'Phân loại khoản sổ không hợp lệ.')
      rows.push(normalize(await db.createEntry(ctx.shopId, { ...item, category: item.category ?? (item.kind === 'BUSINESS_REVENUE' ? 'SALES' : 'OTHER') }, client)))
    }
    return { before: null, after: { entries: rows } }
  },
  async revert(client, log, ctx) {
    for (const saved of [...log.after.entries].reverse()) {
      const current = await db.findEntry(ctx.shopId, saved.id, client, true)
      if (!current || !same(current, saved) || !current.manual) throw conflict()
      await db.removeEntry(ctx.shopId, saved.id, client)
    }
  },
}

export const deleteManualEntry = {
  name: 'delete_manual_entry', tier: 'write', description: 'Đề xuất xóa một khoản nhập tay theo mã khoản sổ; chưa xóa cho đến khi duyệt.',
  schema: z.object({ entryId: z.string().uuid() }).strict(),
  async propose(input, ctx) {
    const row = await db.findEntry(ctx.shopId, input.entryId)
    if (!row) throw missing()
    if (!row.manual) throw manualOnly()
    return { tool: 'delete_manual_entry', input, expected: normalize(row) }
  },
  async apply(client, input, ctx, expected) {
    const current = await db.findEntry(ctx.shopId, input.entryId, client, true)
    if (!current || !same(current, expected)) throw conflict()
    if (!current.manual) throw manualOnly()
    await db.removeEntry(ctx.shopId, input.entryId, client)
    return { before: { entries: [normalize(current)] }, after: null }
  },
  async revert(client, log, ctx) {
    for (const row of log.before.entries) {
      if (row.shop_id !== ctx.shopId || await db.findEntry(ctx.shopId, row.id, client, true)) throw conflict()
      await db.restoreEntry(row, client)
    }
  },
}

export const writeTools = [addLedgerEntries, deleteManualEntry]
