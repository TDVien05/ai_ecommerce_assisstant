import { Money } from '@/components/flowy'
import { Badge } from '@/components/ui/badge'
import type { MatchStatus, Payment } from '@/lib/payments'
import { cn } from '@/lib/utils'

const MATCH: Record<MatchStatus, { label: string; variant: 'risk-low' | 'risk-mid' | 'outline' }> = {
  MATCHED: { label: 'Đã khớp đơn', variant: 'risk-low' },
  UNDERPAID: { label: 'Thiếu tiền', variant: 'risk-mid' },
  NO_ORDER: { label: 'Chưa có đơn', variant: 'risk-mid' },
  IGNORED: { label: 'Không đối soát', variant: 'outline' },
}

export function MatchBadge({ status }: { status: MatchStatus }) {
  return <Badge variant={MATCH[status].variant}>{MATCH[status].label}</Badge>
}

/** Tiền vào màu tăng, tiền ra màu giảm kèm dấu "−". */
export function PaymentAmount({ payment, size }: { payment: Payment; size?: 'md' | 'lg' }) {
  const out = payment.transferType === 'out'
  return (
    <Money
      value={out ? -payment.transferAmount : payment.transferAmount}
      size={size}
      className={cn(out ? 'text-risk-high' : 'text-risk-low')}
    />
  )
}
