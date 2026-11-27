import { ApiError } from '@/lib/api'
import type { LedgerEntry } from '@/lib/finance/types'

const key = 'flowy-demo-manual-ledger-v1'
export function readManualLedger(): LedgerEntry[] {
  let raw: string | null
  try { raw = localStorage.getItem(key) } catch { throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Không đọc được dữ liệu lưu trên trình duyệt.') }
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every((entry) => entry && entry.manual === true && typeof entry.id === 'string' && Number.isSafeInteger(entry.amount) && entry.amount > 0 && typeof entry.occurredAt === 'string' && Number.isFinite(Date.parse(entry.occurredAt)))) throw new Error('invalid')
    return value as LedgerEntry[]
  } catch { throw new ApiError(503, 'STORAGE_INVALID', 'Dữ liệu lưu trên trình duyệt không hợp lệ; chưa thể thay đổi sổ.') }
}
export function saveManualLedger(entries: LedgerEntry[]) {
  try { localStorage.setItem(key, JSON.stringify(entries)) } catch { throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Không lưu được trên trình duyệt. Kiểm tra dung lượng và thử lại.') }
}
