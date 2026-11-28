import { useCallback, useEffect, useRef, useState } from 'react'
import { Money, ResultCard } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { financeApi, type LedgerResponse, type LedgerType } from '@/lib/finance'
import { ExpenseDialog } from './ExpenseDialog'
import { categoryLabels } from './categoryLabels'
import { isReal } from '@/lib/realApi'
import { range, type Period } from '@/lib/finance/period'
import { useLocation } from 'react-router-dom'

export function LedgerPanel() {
  const {search}=useLocation()
  const [period, setPeriod] = useState<Period>('week')
  const [type, setType] = useState<LedgerType | 'ALL'>('ALL')
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(()=>{const params=new URLSearchParams(search), value=params.get('period'), kind=params.get('type');if(value==='today'||value==='week'||value==='month')setPeriod(value);if(kind==='INCOME'||kind==='EXPENSE')setType(kind)},[search])
  const requestId = useRef(0)
  const load = useCallback(() => { const id = ++requestId.current; setError(''); financeApi.ledger({ ...range(period), ...(type === 'ALL' ? {} : { type }) }).then((result) => { if (id === requestId.current) setData(result) }).catch((err: unknown) => { if (id === requestId.current) setError(err instanceof Error ? err.message : 'Không tải được sổ thu chi.') }) }, [period, type])
  useEffect(() => { let active = true; const pending = requestId; queueMicrotask(() => { if (active) load() }); window.addEventListener('flowy:ledger-changed', load); return () => { active = false; pending.current++; window.removeEventListener('flowy:ledger-changed', load) } }, [load])
  return <div className="flex flex-col gap-4">
    {!isReal('finance') && <p className="text-sm text-muted-foreground">Dữ liệu mẫu. Khoản nhập tay được lưu trên trình duyệt này.</p>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={() => setOpen(true)}>Ghi khoản thu chi</Button><span className="flex-1" />{([['today', 'Hôm nay'], ['week', '7 ngày'], ['month', 'Tháng này']] as const).map(([value, label]) => <Button size="sm" key={value} variant={period === value ? 'default' : 'outline'} onClick={() => { if (period !== value) { setData(null); setPeriod(value) } }}>{label}</Button>)}</div>
    {error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}
    {!data && !error && <p>Đang tải sổ thu chi…</p>}
    {data && <><ResultCard metrics={[{ label: 'Thu', value: data.totals.income }, { label: 'Chi', value: data.totals.expense }, { label: 'Chênh lệch', value: data.totals.net }]} source={isReal('finance') ? 'sổ thu chi' : 'sổ thu chi (dữ liệu mẫu)'} updatedAt={new Date(data.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} how={[{ label: 'Tổng thu', value: data.totals.income }, { label: 'Trừ tổng chi', value: data.totals.expense }, { label: 'Chênh lệch', value: data.totals.net, total: true }]} />
      <div className="flex flex-wrap gap-2">{([['ALL', 'Tất cả'], ['INCOME', 'Thu'], ['EXPENSE', 'Chi']] as const).map(([value, label]) => <Button key={value} size="sm" variant={type === value ? 'default' : 'outline'} onClick={() => { if (type !== value) { setData(null); setType(value) } }}>{label}</Button>)}</div>
      {data.items.length === 0 ? <p className="text-muted-foreground">Chưa có khoản thu chi trong khoảng này.</p> : <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhóm</TableHead><TableHead>Ghi chú</TableHead><TableHead className="text-right">Số tiền</TableHead></TableRow></TableHeader><TableBody>{data.items.map((entry) => <TableRow key={entry.id}><TableCell>{new Date(entry.occurredAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</TableCell><TableCell>{categoryLabels[entry.category]}</TableCell><TableCell>{entry.note || entry.orderCode || '—'}</TableCell><TableCell className="text-right">{entry.type === 'EXPENSE' ? '−' : ''}<Money value={entry.amount} /></TableCell></TableRow>)}</TableBody></Table></div>}
    </>}
    {open && <ExpenseDialog onClose={() => setOpen(false)} onChanged={load} />}
  </div>
}
