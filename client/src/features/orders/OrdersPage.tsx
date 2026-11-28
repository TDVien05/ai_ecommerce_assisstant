import { useCallback, useEffect, useRef, useState } from 'react'
import { Money } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ordersApi, type Order, type OrderStatus } from '@/lib/orders'
import { OrderDialog } from './OrderDialog'
import { StatusBadge } from './statusLabel'
import { statusLabels } from './statusLabels'
import { isReal } from '@/lib/realApi'
import { useSearchParams } from 'react-router-dom'

const filters: Array<OrderStatus | 'ALL'> = ['ALL', 'AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED']
export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const overdue = params.get('overdue') === '1'
  const code = params.get('code')?.slice(0, 100) || undefined
  const status = params.get('status') as OrderStatus | null
  const filter = status && filters.includes(status) ? status : 'ALL'
  const query = params.get('q')?.slice(0, 100) ?? code ?? ''
  const [data, setData] = useState<{ items: Order[]; overdue: boolean; code?: string } | null>(null)
  const orders = data && data.overdue === overdue && data.code === code ? data.items : null
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const load = useCallback(() => {
    const id = ++requestId.current
    setError('')
    ordersApi.list({ ...(overdue ? { overdue: '1' } : {}), ...(code ? { code } : {}) })
      .then(({ items }) => { if (id === requestId.current) setData({ items, overdue, code }) })
      .catch(() => { if (id === requestId.current) setError('Không tải được đơn hàng. Bạn thử lại nhé.') })
  }, [code, overdue])
  useEffect(() => { let active = true; const pending = requestId; queueMicrotask(() => { if (active) load() }); window.addEventListener('flowy:orders-changed',load); return () => { active = false; pending.current++; window.removeEventListener('flowy:orders-changed',load) } }, [load])
  const visible = orders?.filter((order) => (filter === 'ALL' || order.status === filter)
    && `${order.paymentCode} ${order.customerName}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
  function updateFilter(name: string, value?: string) {
    const next = new URLSearchParams(params)
    if (name === 'q') next.delete('code')
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap gap-2" aria-label="Lọc trạng thái">{filters.map((value) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} aria-pressed={filter === value} onClick={() => updateFilter('status', value === 'ALL' ? undefined : value)}>{value === 'ALL' ? 'Tất cả' : statusLabels[value]}</Button>)}</div>
    <Input aria-label="Tìm đơn hàng" placeholder="Tìm mã đơn hoặc tên khách" value={query} maxLength={100} onChange={(event) => updateFilter('q', event.target.value)} />
    {overdue && <div className="flex flex-wrap items-center gap-2"><span>Chỉ hiện đơn đã quá hạn thanh toán.</span><Button size="sm" variant="outline" onClick={() => updateFilter('overdue')}>Bỏ lọc quá hạn</Button></div>}
    {error && <div role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></div>}
    {!orders && !error && <p>Đang tải đơn hàng…</p>}
    {visible?.length === 0 && <p className="text-muted-foreground">Không có đơn hàng phù hợp.</p>}
    {!!visible?.length && <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Mã đơn</TableHead><TableHead>Khách hàng</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Tổng đơn</TableHead><TableHead /></TableRow></TableHeader><TableBody>{visible.map((order) => <TableRow key={order.id}><TableCell>{order.paymentCode}</TableCell><TableCell>{order.customerName}</TableCell><TableCell><StatusBadge status={order.status} /></TableCell><TableCell className="text-right"><Money value={order.total} /></TableCell><TableCell><Button variant="ghost" onClick={() => setSelected(order.id)}>Xem chi tiết</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    <p className="text-xs text-muted-foreground">Nguồn: dữ liệu đơn hàng{isReal('orders') ? '; tối đa 100 đơn mới nhất' : ' mẫu'}. Xem chi tiết đơn để xem cách tính.</p>
    {selected && <OrderDialog id={selected} onClose={() => setSelected(null)} onChanged={load} />}
  </div>
}
