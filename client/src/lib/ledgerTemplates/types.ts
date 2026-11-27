import type { LedgerChannel, LedgerEntry } from '@/lib/finance/types'

export type TemplateCode = 'S1a-HKD' | 'S2a-HKD' | 'S2b-HKD' | 'S2c-HKD' | 'S2d-HKD' | 'S2e-HKD' | 'S3a-HKD'
export type Field = 'date' | 'description' | 'amount' | 'documentRef' | 'documentDate' | 'industry' | 'revenue' | 'expense' | 'difference' | 'cashIn' | 'cashOut' | 'quantityIn' | 'quantityOut' | 'quantityBalance' | 'unitPrice' | 'inventoryIn' | 'inventoryOut' | 'inventoryBalance' | 'taxRate' | 'taxAmount'
export type Column = { key: Field; label: string; value: 'text' | 'date' | 'money' | 'number'; source: string; formula?: string; total?: boolean }
export type Template = { code: TemplateCode; name: string; appliesTo: string; needsReview: true; filter: 'revenue' | 'income-expense' | 'money' | 'unavailable'; columns: Column[]; note: string }
export type BookRow = { id: string; channel: LedgerChannel | null; cells: Partial<Record<Field, string | number | null>> }
export type BookSection = { title: string; rows: BookRow[]; totals: Partial<Record<Field, number | null>>; openingBalance: number | null; closingBalance: number | null }
export type LedgerBook = { template: Template; from: string; to: string; sections: BookSection[]; warnings: string[]; updatedAt: string; source: string }
export type Threshold = { year: number; revenue: number; threshold: number; updatedAt: string; source: string }
export type EntryForBook = LedgerEntry
