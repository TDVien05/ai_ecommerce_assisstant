import { useCallback, useEffect, useRef, useState } from 'react'
import { Money, ResultCard } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { financeApi, type LedgerResponse, type LedgerType } from '@/lib/finance'
import { ExpenseDialog } from './ExpenseDialog'
import { categoryLabels } from './categoryLabels'
import { isReal } from '@/lib/realApi'
import { range, type Period } from '@/lib/finance/period'
import { useSearchParams } from 'react-router-dom'

export function LedgerPanel() {
  const [params, setParams] = useSearchParams()
  const unclassified = params.get('unclassified') === '1'
  const value = params.get('period'), kind = params.get('type')
  const period: Period = value === 'today' || value === 'calendar-week' || value === 'month' ? value : 'week'
  const type: LedgerType | 'ALL' = kind === 'INCOME' || kind === 'EXPENSE' ? kind : 'ALL'
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const requestId = useRef(0)
  const load = useCallback(() => { const id = ++requestId.current; setError(''); financeApi.ledger({ ...range(period), ...(type === 'ALL' ? {} : { type }) }).then((result) => { if (id === requestId.current) setData(result) }).catch((err: unknown) => { if (id === requestId.current) setError(err instanceof Error ? err.message : 'Không tải được sổ thu chi.') }) }, [period, type])
  useEffect(() => { let active = true; const pending = requestId; queueMicrotask(() => { if (active) load() }); window.addEventListener('flowy:ledger-changed', load); return () => { active = false; pending.current++; window.removeEventListener('flowy:ledger-changed', load) } }, [load])
  const items = data?.items.filter((entry) => !unclassified || entry.kind === null
    || (entry.type === 'INCOME' && entry.kind === 'EXPENSE')
    || (entry.type === 'EXPENSE' && entry.kind === 'BUSINESS_REVENUE'))
  function updateFilter(name: string, value?: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name !== 'unclassified') setData(null)
    setParams(next, { replace: true })
  }
  return <div className="flex flex-col gap-4">
    {!isReal('finance') && <p className="text-sm text-muted-foreground">Dữ liệu mẫu. Khoản nhập tay được lưu trên trình duyệt này.</p>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={() => setOpen(true)}>Ghi khoản thu chi</Button><span className="flex-1" />{([['today', 'Hôm nay'], ['week', '7 ngày'], ['calendar-week', 'Tuần này'], ['month', 'Tháng này']] as const).map(([value, label]) => <Button size="sm" key={value} variant={period === value ? 'default' : 'outline'} onClick={() => { if (period !== value) updateFilter('period', value) }}>{label}</Button>)}</div>
    {unclassified && <div className="flex flex-wrap items-center gap-2"><span>Chỉ hiện khoản chưa phân loại. Tổng thu chi vẫn tính theo kỳ đang xem.</span><Button size="sm" variant="outline" onClick={() => updateFilter('unclassified')}>Bỏ lọc phân loại</Button></div>}
    {error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}
    {!data && !error && <p>Đang tải sổ thu chi…</p>}
    {data && <><ResultCard metrics={[{ label: 'Thu', value: data.totals.income }, { label: 'Chi', value: data.totals.expense }, { label: 'Chênh lệch', value: data.totals.net }]} source={isReal('finance') ? 'sổ thu chi' : 'sổ thu chi (dữ liệu mẫu)'} updatedAt={new Date(data.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} how={[{ label: 'Tổng thu', value: data.totals.income }, { label: 'Trừ tổng chi', value: data.totals.expense }, { label: 'Chênh lệch', value: data.totals.net, total: true }]} />
      <div className="flex flex-wrap gap-2">{([['ALL', 'Tất cả'], ['INCOME', 'Thu'], ['EXPENSE', 'Chi']] as const).map(([value, label]) => <Button key={value} size="sm" variant={type === value ? 'default' : 'outline'} onClick={() => { if (type !== value) updateFilter('type', value === 'ALL' ? undefined : value) }}>{label}</Button>)}</div>
      {!items?.length ? <p className="text-muted-foreground">{unclassified ? 'Không có khoản chưa phân loại trong kỳ.' : 'Chưa có khoản thu chi trong khoảng này.'}</p> : <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhóm</TableHead><TableHead>Ghi chú</TableHead><TableHead className="text-right">Số tiền</TableHead></TableRow></TableHeader><TableBody>{items.map((entry) => <TableRow key={entry.id}><TableCell>{new Date(entry.occurredAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</TableCell><TableCell>{categoryLabels[entry.category]}</TableCell><TableCell>{entry.note || entry.orderCode || '—'}</TableCell><TableCell className="text-right">{entry.type === 'EXPENSE' ? '−' : ''}<Money value={entry.amount} /></TableCell></TableRow>)}</TableBody></Table></div>}
    </>}
    {open && <ExpenseDialog onClose={() => setOpen(false)} onChanged={load} />}
  </div>
}
