import type { OrderDetail } from '@/lib/orders/types'
import type { Payment } from '@/lib/payments/types'
import type { LedgerEntry } from '@/lib/finance/types'
import type { Alert } from '@/lib/alerts/types'
import type { Conversation, ChatLine } from '@/lib/conversations/types'
import type { Source } from '@/lib/sources/types'
import type { ShopSettings } from '@/lib/shop/types'

export type InventoryMovement = { id: string; product: string; date: string; documentRef: string; direction: 'IN' | 'OUT'; quantity: number; unitPrice: number }
export type LocalFixture = {
  seedStore?: { orders: OrderDetail[]; payments: Payment[]; entries: LedgerEntry[]; orderCosts: Record<string, number>; alerts: Alert[] }
  demoOpening?: { asOf: string; CASH: number; BANK: number }
  demoInventory?: InventoryMovement[]
  demoTaxDocuments?: { id: string; date: string; ref: string; quantity: number; taxRate: string; amount: number }[]
  conversations?: Conversation[]
  lines?: Record<string, ChatLine[]>
  sources?: Source[]
  shop?: ShopSettings
  landingRevenue?: { amount: number; source: string; updatedAt: string }
}

// Tệp này là tùy chọn và bị Git bỏ qua. Khi vắng mặt, mock trả trạng thái trống.
const localModules = import.meta.glob<LocalFixture>('./demoSeed.local.ts', { eager: true })
export const localFixture: LocalFixture = Object.values(localModules)[0] ?? {}
