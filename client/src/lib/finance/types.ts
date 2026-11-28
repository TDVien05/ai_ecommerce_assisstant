/**
 * Method | Path | Request | Response | Lỗi
 * GET | /api/finance/ledger | from?, to?, type? | LedgerResponse | 400, 401
 * POST | /api/finance/ledger | CreateLedgerEntry | { entry, message } | 400, 401
 * DELETE | /api/finance/ledger/:id | — | { message } | 401, 404, 409
 * GET | /api/finance/summary | from?, to? | FinanceSummary | 400, 401
 * GET | /api/finance/timeseries | from?, to?, interval? | { points } | 400, 401
 * GET | /api/finance/top-products | from?, to?, limit? | { items } | 400, 401
 * Tổng sổ, updatedAt, DELETE và các hình dạng chưa có trong docs/API.md là đề xuất.
 */
export type LedgerType = 'INCOME' | 'EXPENSE'
export type LedgerCategory = 'SALES' | 'SHIPPING' | 'ADS' | 'INVENTORY' | 'OTHER'
export type LedgerKind = 'BUSINESS_REVENUE' | 'PERSONAL' | 'EXPENSE' | 'TRANSFER'
export type LedgerChannel = 'CASH' | 'BANK' | 'EWALLET'
/** Tiền là số nguyên VND do server tính; thời gian theo ISO 8601. */
export type LedgerEntry = {
  id: string
  type: LedgerType
  kind: LedgerKind | null
  channel: LedgerChannel | null
  category: LedgerCategory
  documentRef: string | null
  documentDate: string | null
  industry: string | null
  amount: number
  orderId: string | null
  orderCode: string | null
  note: string | null
  occurredAt: string
  manual: boolean
}
export type CreateLedgerEntry = { type: LedgerType; kind: LedgerKind; channel: LedgerChannel; category: LedgerCategory; documentRef: string | null; documentDate: string | null; industry: string | null; amount: number; note: string; occurredAt: string }
export type LedgerResponse = { items: LedgerEntry[]; totals: { income: number; expense: number; net: number }; updatedAt: string }
export type FinanceSummary = { revenue: number; cost: number; grossProfit: number; expenses: number; netProfit: number; orderCount: number; aov: number }
export type TimePoint = { date: string; revenue: number }
export type TopProduct = { productId: string; name: string; quantity: number; revenue: number }
export type PartialReport = { revenue:number; expenses:number; cost:number|null; grossProfit:number|null; netProfit:number|null; totalCount:number; classifiedCount:number; unknownCount:number; missingCostCount:number; cashIn:number; cashOut:number; points:TimePoint[]; products:TopProduct[]; updatedAt:string }
type Period = { from?: string; to?: string }
export interface FinanceApi {
  ledger(query?: Period & { type?: LedgerType }): Promise<LedgerResponse>
  createEntry(body: CreateLedgerEntry): Promise<{ entry: LedgerEntry; message: string }>
  /** Chỉ xóa khoản nhập tay. */
  deleteEntry(id: string): Promise<{ message: string }>
  summary(query?: Period): Promise<FinanceSummary>
  timeseries(query?: Period & { interval?: 'day' | 'week' }): Promise<{ points: TimePoint[] }>
  topProducts(query?: Period & { limit?: number }): Promise<{ items: TopProduct[] }>
}
