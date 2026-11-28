import { useEffect, useState } from 'react'
import { Money } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import type { PaymentInstructions } from '@/lib/payments/config'

/**
 * Khung hướng dẫn chuyển khoản: mã đơn, số tiền, hạn 30 phút và ảnh VietQR.
 * Dùng token màu của theme; không có mã màu viết tay.
 */
export function PaymentBox({
  payment,
  onCopy,
  compact = false,
}: {
  payment: PaymentInstructions
  onCopy?: (text: string) => void
  compact?: boolean
}) {
  // "Quá hạn" is time-based. It is recomputed on a timer instead of during render (which would
  // be impure), so the badge flips without needing a refetch.
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const deadline = payment.expiresAt ? new Date(payment.expiresAt).getTime() : null
    if (deadline === null) return
    const timer = setInterval(() => setExpired(Date.now() > deadline), 30_000)
    return () => clearInterval(timer)
  }, [payment.expiresAt])

  if (!payment.ready) {
    return (
      <div className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        Cửa hàng chưa cấu hình tài khoản nhận tiền. Vào Cài đặt → Thanh toán để thêm số tài khoản và
        mã ngân hàng, sau đó khách mới chuyển khoản được.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Số tiền cần chuyển
          </span>
          <span className="text-[22px] font-semibold tabular-nums">
            <Money value={payment.amount} />
          </span>
        </div>
        <span
          className={
            expired
              ? 'border border-risk-high bg-risk-high-soft px-2 py-1 text-xs text-risk-high rounded-sm'
              : 'border border-risk-mid bg-risk-mid-soft px-2 py-1 text-xs text-risk-mid rounded-sm'
          }
        >
          {expired ? 'Đã quá hạn thanh toán' : `Còn ${payment.windowMinutes} phút`}
        </span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Mã đơn</dt>
        <dd className="font-medium tabular-nums">{payment.paymentCode}</dd>
        <dt className="text-muted-foreground">Ngân hàng</dt>
        <dd>{payment.bankCode ?? '—'}</dd>
        <dt className="text-muted-foreground">Số tài khoản</dt>
        <dd className="tabular-nums">{payment.bankAccountNumber ?? '—'}</dd>
        <dt className="text-muted-foreground">Chủ tài khoản</dt>
        <dd>{payment.bankAccountName ?? '—'}</dd>
        <dt className="text-muted-foreground">Nội dung</dt>
        <dd className="font-medium tabular-nums">{payment.transferNote}</dd>
      </dl>

      {!compact && payment.qrUrl && (
        <div className="flex flex-col gap-2">
          <img
            src={payment.qrUrl}
            alt={`Mã VietQR cho đơn ${payment.paymentCode}`}
            className="h-56 w-56 border border-border"
            loading="lazy"
          />
          <p className="text-xs text-muted-foreground">
            Quét mã để điền sẵn số tiền và nội dung. Khách không cần gõ tay.
          </p>
        </div>
      )}

      {onCopy && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onCopy(payment.transferNote)}>
            Sao chép nội dung
          </Button>
          <Button variant="outline" size="sm" onClick={() => onCopy(String(payment.amount))}>
            Sao chép số tiền
          </Button>
        </div>
      )}
    </div>
  )
}
