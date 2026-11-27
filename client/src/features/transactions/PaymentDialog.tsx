import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Money, toastDone } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { paymentsApi, type Payment, type PendingOrder } from '@/lib/payments'
import { cn } from '@/lib/utils'
import { MatchBadge, PaymentAmount } from './display'
import { formatTime } from './formatTime'

const showError = (err: unknown) =>
  toast.error(err instanceof Error ? err.message : 'Không gửi được. Bạn thử lại nhé.')

/** Chi tiết một giao dịch; giao dịch tiền vào chưa có đơn thì gán tay được. */
export function PaymentDialog({
  payment,
  onClose,
  onChanged,
}: {
  payment: Payment
  onClose: () => void
  onChanged: () => void
}) {
  const assignable = payment.matchStatus === 'NO_ORDER' && payment.transferType === 'in'
  const [orders, setOrders] = useState<PendingOrder[] | null>(null)
  const [orderId, setOrderId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const selected = orders?.find((o) => o.id === orderId)

  useEffect(() => {
    if (!assignable) return
    paymentsApi.pendingOrders().then((res) => setOrders(res.items), showError)
  }, [assignable])

  const assign = async () => {
    if (!orderId) return
    setSaving(true)
    try {
      const { message } = await paymentsApi.assign(payment.id, { orderId })
      toastDone(message, () => {
        paymentsApi.unassign(payment.id).then(onChanged, showError)
      })
      onChanged()
      onClose()
    } catch (err) {
      showError(err)
      setSaving(false)
    }
  }

  const rows: [string, React.ReactNode][] = [
    ['Thời gian', formatTime(payment.transactionDate)],
    ['Nội dung', payment.content],
    ['Ngân hàng', `${payment.gateway} · ${payment.accountNumber}`],
    ['Mã tham chiếu', payment.referenceCode],
    ['Đối soát', <MatchBadge key="match" status={payment.matchStatus} />],
  ]
  if (payment.orderCode) rows.push(['Đơn', payment.orderCode])
  if (payment.shortfall !== null) rows.push(['Còn thiếu', <Money key="shortfall" value={payment.shortfall} />])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto shadow-overlay sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{payment.transferType === 'in' ? 'Tiền vào' : 'Tiền ra'}</DialogTitle>
          <PaymentAmount payment={payment} size="lg" />
        </DialogHeader>

        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>

        {assignable && (
          <div className="flex flex-col gap-2">
            <b className="font-semibold">Gán vào đơn đang chờ thanh toán</b>
            {!orders && <p className="m-0 text-muted-foreground">Đang tải đơn...</p>}
            {orders?.length === 0 && <p className="m-0 text-muted-foreground">Không có đơn nào đang chờ thanh toán.</p>}
            {orders?.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={o.id === orderId}
                onClick={() => setOrderId(o.id)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left',
                  o.id === orderId ? 'border-foreground bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                <span>
                  {o.paymentCode} · {o.customerName}
                </span>
                <Money value={o.total} />
              </button>
            ))}
            <p className="m-0 text-xs text-muted-foreground">
              Chỉ gán khi bạn chắc khoản tiền này là của đơn đó. Máy chủ so số tiền và cập nhật đối soát.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button size="lg" variant="outline" onClick={onClose}>
            Đóng
          </Button>
          {assignable && (
            <Button size="lg" disabled={!selected || saving} onClick={assign}>
              {selected ? `Gán vào đơn ${selected.paymentCode}` : 'Gán vào đơn'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
