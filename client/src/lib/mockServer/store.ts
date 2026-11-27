import type { OrderDetail } from '@/lib/orders/types'
import type { Payment } from '@/lib/payments/types'
import type { LedgerEntry } from '@/lib/finance/types'
import type { Alert } from '@/lib/alerts/types'
import { localFixture } from './localFixture'
import { readManualLedger } from './manualLedger'

const seed = localFixture.seedStore
export const store: { orders: OrderDetail[]; payments: Payment[]; entries: LedgerEntry[]; orderCosts: Record<string, number>; alerts: Alert[]; heldOrders: Set<string>; manualAssignments: Map<string, { orderId: string; entryId: string | null }> } = {
  orders: structuredClone(seed?.orders ?? []), payments: structuredClone(seed?.payments ?? []), entries: structuredClone(seed?.entries ?? []), orderCosts: structuredClone(seed?.orderCosts ?? {}), alerts: structuredClone(seed?.alerts ?? []), heldOrders: new Set(), manualAssignments: new Map(),
}

export function syncManualLedger() { store.entries = [...store.entries.filter((entry) => !entry.manual), ...readManualLedger()] }
export function respond<T>(data: T): Promise<T> { const copy = structuredClone(data); return new Promise((resolve) => setTimeout(() => resolve(copy), 250)) }
const ledgerListeners = new Set<() => void>()
export function subscribeLedger(listener: () => void) { ledgerListeners.add(listener); return () => { ledgerListeners.delete(listener) } }
export function notifyLedger() { ledgerListeners.forEach((listener) => listener()) }
