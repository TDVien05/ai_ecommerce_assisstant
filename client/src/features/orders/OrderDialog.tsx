import { useEffect, useState } from 'react'
import { Money, ResultCard } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ordersApi, type OrderDetail, type OrderTransition } from '@/lib/orders'
import { StatusBadge } from './statusLabel'

export function OrderDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { ordersApi.get(id).then(({ order }) => setOrder(order)).catch(() => setError('Không tải được đơn hàng. Bạn thử lại nhé.')) }, [id])
  async function change(status: OrderTransition) {
    setSaving(true); setError('')
    try { await ordersApi.updateStatus(id, { status }); onChanged(); onClose() }
    catch (err) { setError(err instanceof Error ? err.message : 'Không đổi được trạng thái. Bạn tải lại và thử lại nhé.'); setSaving(false) }
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto rounded-none shadow-overlay sm:max-w-md">
    <DialogHeader><DialogTitle>Chi tiết đơn hàng</DialogTitle></DialogHeader>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!order && !error && <p>Đang tải đơn hàng…</p>}
    {order && <>
      <p className="m-0 font-semibold">{order.paymentCode} · {order.customerName}</p><StatusBadge status={order.status} />
      <p className="m-0 text-muted-foreground">Điện thoại: {order.shippingPhone || 'Chưa có'} · Địa chỉ: {order.shippingAddress || 'Chưa có'}</p>
      <div className="border border-border p-3">{order.items.map((item, index) => <div key={index} className="flex justify-between gap-4"><span>{item.name} · {item.quantity}</span><Money value={item.lineTotal} /></div>)}</div>
      <ResultCard metrics={[{ label: 'Tổng đơn', value: order.total }]} source="dữ liệu đơn hàng" updatedAt="chưa có thời điểm" how={[{ label: 'Tiền hàng', value: order.subtotal }, { label: 'Phí giao hàng', value: order.shippingFee }, { label: 'Tổng đơn', value: order.total, total: true }]} />
      <p className="m-0">Giao dịch: {order.payments.length ? order.payments.map((payment) => payment.referenceCode).join(', ') : 'Chưa có'}</p>
      {confirmCancel && <p>Bạn muốn hủy đơn {order.paymentCode}?</p>}
    </>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Đóng</Button>
      {order?.status === 'PAID' && <Button disabled={saving} onClick={() => change('SHIPPING')}>Chuyển sang đang giao</Button>}
      {order?.status === 'SHIPPING' && <Button disabled={saving} onClick={() => change('COMPLETED')}>Hoàn thành đơn</Button>}
      {order?.status === 'AWAITING_PAYMENT' && <Button variant="destructive" disabled={saving} onClick={() => confirmCancel ? change('CANCELLED') : setConfirmCancel(true)}>{confirmCancel ? 'Xác nhận hủy đơn' : 'Hủy đơn'}</Button>}
    </DialogFooter>
  </DialogContent></Dialog>
}
