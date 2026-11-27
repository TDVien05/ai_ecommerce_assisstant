import { useCallback, useEffect, useState } from 'react'
import { Segmented } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { paymentsApi, type Payment } from '@/lib/payments'
import { MatchBadge, PaymentAmount } from './display'
import { formatTime } from './formatTime'
import { PaymentDialog } from './PaymentDialog'

const FILTERS: Record<string, (p: Payment) => boolean> = {
  'Tất cả': () => true,
  'Cần xử lý': (p) => p.matchStatus === 'NO_ORDER' || p.matchStatus === 'UNDERPAID',
  'Đã khớp': (p) => p.matchStatus === 'MATCHED',
  'Không đối soát': (p) => p.matchStatus === 'IGNORED',
}

/** Danh sách giao dịch ngân hàng: lọc, tìm, xem chi tiết và gán tay vào đơn. */
export function TransactionsPanel() {
  const [items, setItems] = useState<Payment[] | null>(null)
  const [error, setError] = useState<string>()
  const [filter, setFilter] = useState('Tất cả')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string>()

  const load = useCallback(() => {
    paymentsApi.list().then(
      (res) => {
        setItems(res.items)
        setError(undefined)
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Không tải được giao dịch.'),
    )
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 border border-risk-high px-3.5 py-3">
        <span>{error}</span>
        <Button variant="outline" onClick={load}>
          Tải lại
        </Button>
      </div>
    )
  }
  if (!items) return <p className="m-0 text-muted-foreground">Đang tải giao dịch...</p>

  const needle = query.trim().toLowerCase()
  const shown = items.filter(
    (p) =>
      FILTERS[filter](p) &&
      [p.content, p.referenceCode, p.orderCode ?? ''].some((v) => v.toLowerCase().includes(needle)),
  )
  const review = items.filter(FILTERS['Cần xử lý']).length
  const open = items.find((p) => p.id === openId)

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-muted-foreground">
        {review > 0 ? `${review} giao dịch cần bạn xử lý.` : 'Không còn giao dịch nào cần xử lý.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={Object.keys(FILTERS)} value={filter} onChange={setFilter} />
        <Input
          type="search"
          aria-label="Tìm giao dịch"
          placeholder="Tìm nội dung, mã đơn, mã tham chiếu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <div className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Đối soát</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="money text-muted-foreground">{formatTime(p.transactionDate)}</TableCell>
                <TableCell className="whitespace-normal">
                  <span className="block min-w-40">{p.content}</span>
                  <small className="block text-xs text-muted-foreground">
                    {p.gateway}
                    {p.orderCode && ` · đơn ${p.orderCode}`}
                  </small>
                </TableCell>
                <TableCell className="text-right">
                  <PaymentAmount payment={p} />
                </TableCell>
                <TableCell>
                  <MatchBadge status={p.matchStatus} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(p.id)}>
                    {p.matchStatus === 'NO_ORDER' && p.transferType === 'in' ? 'Gán đơn' : 'Xem'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center whitespace-normal text-muted-foreground">
                  Không có giao dịch nào khớp bộ lọc.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Nguồn: biến động số dư ngân hàng (dữ liệu mẫu).</p>
      {open && <PaymentDialog payment={open} onClose={() => setOpenId(undefined)} onChanged={load} />}
    </div>
  )
}
