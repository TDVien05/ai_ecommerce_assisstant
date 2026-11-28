import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiskAlert, RiskBadge } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrderDialog } from '@/features/orders/OrderDialog'
import { alertsApi, type Alert } from '@/lib/alerts'
import { paymentsApi, type Payment } from '@/lib/payments'
import { isReal } from '@/lib/realApi'

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const navigate = useNavigate()
  const requestId = useRef(0)
  const load = useCallback(() => {
    const id = ++requestId.current
    setAlerts(null); setError('')
    const payments = isReal('alerts') ? Promise.resolve({items:[] as Payment[]}) : paymentsApi.list()
    Promise.all([alertsApi.list(), payments]).then(([a, p]) => { if (id === requestId.current) { setAlerts(a.items); setPayments(p.items.filter((item) => item.matchStatus === 'NO_ORDER' || item.matchStatus === 'UNDERPAID')) } }).catch((err: unknown) => { if (id === requestId.current) setError(err instanceof Error ? err.message : 'Không tải được cảnh báo.') })
  }, [])
  useEffect(() => { let active=true; const pending=requestId; queueMicrotask(() => { if (active) load() }); window.addEventListener('flowy:alerts-changed',load); return () => { active=false;pending.current++;window.removeEventListener('flowy:alerts-changed',load) } }, [load])
  async function action(id: string, type: 'hold' | 'dismiss') {
    try { await alertsApi[type](id); load() } catch (err) { setError(err instanceof Error ? err.message : 'Không cập nhật được cảnh báo.') }
  }
  const open = alerts?.filter((item) => item.status === 'OPEN') ?? []
  const resolved = alerts?.filter((item) => item.status !== 'OPEN') ?? []
  return <div className="flex flex-col gap-4">
    {error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}
    {!alerts && !error && <p>Đang tải cảnh báo…</p>}
    {alerts && <Tabs defaultValue="open"><TabsList variant="line"><TabsTrigger value="open">Đang mở</TabsTrigger><TabsTrigger value="resolved">Đã xử lý</TabsTrigger></TabsList>
      <TabsContent value="open" className="flex flex-col gap-4">
        {open.length === 0 && <p className="text-muted-foreground">Không có cảnh báo đang mở.</p>}
        {open.map((alert) => <div key={alert.id} className="flex flex-col gap-2"><RiskAlert title={alert.title} level={alert.level} reasons={alert.reasons} safeActionLabel={isReal('alerts') ? 'Tạm giữ cảnh báo' : 'Giữ đơn, chưa giao'} onSafeAction={() => action(alert.id, 'hold')} onView={alert.orderId && (!isReal('alerts') || isReal('orders')) ? () => setSelected(alert.orderId) : undefined} detectedNote={`Phát hiện ${new Date(alert.detectedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${isReal('alerts') ? '' : ' · dữ liệu mẫu'}`} /><div><Button variant="ghost" onClick={() => action(alert.id, 'dismiss')}>Bỏ qua cảnh báo</Button></div></div>)}
        {!isReal('alerts') && <div className="border border-border p-4"><h2 className="font-semibold">Giao dịch cần xử lý</h2><p className="mt-2 text-muted-foreground">{payments.length} giao dịch chưa có đơn hoặc thiếu tiền.</p><Button className="mt-3" variant="outline" onClick={() => navigate('/pages/ledger')}>Xem giao dịch</Button></div>}
      </TabsContent>
      <TabsContent value="resolved" className="flex flex-col gap-3">{resolved.length === 0 ? <p className="text-muted-foreground">Chưa có cảnh báo đã xử lý.</p> : resolved.map((alert) => <div key={alert.id} className="flex flex-wrap items-center gap-3 border border-border p-4"><span className="font-semibold">{alert.title}</span><RiskBadge level={alert.level} /><span className="text-muted-foreground">{alert.status === 'HELD' ? (isReal('alerts') ? 'Đã tạm giữ cảnh báo' : 'Đã giữ đơn') : 'Đã bỏ qua'}</span></div>)}</TabsContent>
    </Tabs>}
    {selected && <OrderDialog id={selected} onClose={() => setSelected(null)} onChanged={load} />}
  </div>
}
