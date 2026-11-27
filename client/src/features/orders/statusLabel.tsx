import { Badge } from '@/components/ui/badge'
import type { OrderStatus } from '@/lib/orders'

import { statusLabels } from './statusLabels'
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={status === 'AWAITING_PAYMENT' ? 'risk-mid' : status === 'PAID' ? 'risk-low' : 'outline'}>{statusLabels[status]}</Badge>
}
