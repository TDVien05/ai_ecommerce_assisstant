import { useCallback, useEffect, useState } from 'react'
import { Money } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ordersApi, type Order, type OrderStatus } from '@/lib/orders'
import { OrderDialog } from './OrderDialog'
import { StatusBadge } from './statusLabel'
import { statusLabels } from './statusLabels'

const filters: Array<OrderStatus | 'ALL'> = ['ALL', 'AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED']
export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => { ordersApi.list().then(({ items }) => { setOrders(items); setError('') }).catch(() => setError('Không tải được đơn hàng. Bạn thử lại nhé.')) }, [])
  useEffect(() => { load() }, [load])
  const visible = orders?.filter((order) => (filter === 'ALL' || order.status === filter) && `${order.paymentCode} ${order.customerName}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap gap-2" aria-label="Lọc trạng thái">{filters.map((value) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'ALL' ? 'Tất cả' : statusLabels[value]}</Button>)}</div>
    <Input aria-label="Tìm đơn hàng" placeholder="Tìm mã đơn hoặc tên khách" value={query} onChange={(event) => setQuery(event.target.value)} />
    {error && <div role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></div>}
    {!orders && !error && <p>Đang tải đơn hàng…</p>}
    {visible?.length === 0 && <p className="text-muted-foreground">Không có đơn hàng phù hợp.</p>}
    {!!visible?.length && <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Mã đơn</TableHead><TableHead>Khách hàng</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Tổng đơn</TableHead><TableHead /></TableRow></TableHeader><TableBody>{visible.map((order) => <TableRow key={order.id}><TableCell>{order.paymentCode}</TableCell><TableCell>{order.customerName}</TableCell><TableCell><StatusBadge status={order.status} /></TableCell><TableCell className="text-right"><Money value={order.total} /></TableCell><TableCell><Button variant="ghost" onClick={() => setSelected(order.id)}>Xem chi tiết</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    <p className="text-xs text-muted-foreground">Nguồn: dữ liệu đơn hàng. Xem chi tiết đơn để xem cách tính.</p>
    {selected && <OrderDialog id={selected} onClose={() => setSelected(null)} onChanged={load} />}
  </div>
}
