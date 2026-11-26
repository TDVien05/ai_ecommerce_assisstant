import { Badge } from '@/components/ui/badge'
import { RISK_LABEL, type RiskLevel } from './types'

type RiskBadgeProps = {
  level: RiskLevel
  /** Nhãn tùy chọn, ví dụ "Thấp" trong bảng đã có cột "Rủi ro". Mặc định "Rủi ro thấp/trung bình/cao". */
  label?: string
}

/** Huy hiệu mức rủi ro. Một trong số ít chỗ được dùng màu. */
export function RiskBadge({ level, label }: RiskBadgeProps) {
  return <Badge variant={`risk-${level}`}>{label ?? RISK_LABEL[level]}</Badge>
}

export type OrderStatus = 'pending' | 'approved' | 'cancelled' | 'new'

const ORDER: Record<OrderStatus, { label: string; variant: 'risk-mid' | 'risk-low' | 'outline' | 'default' }> = {
  pending: { label: 'Chờ thanh toán', variant: 'risk-mid' },
  approved: { label: 'Đã duyệt', variant: 'risk-low' },
  cancelled: { label: 'Đã hủy', variant: 'outline' },
  new: { label: 'Mới', variant: 'default' },
}

/** Huy hiệu trạng thái đơn. Đơn chỉ sang "Đã duyệt" khi webhook thanh toán báo tiền vào thật. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}
