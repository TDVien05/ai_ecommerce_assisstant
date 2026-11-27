import { useEffect, useState } from 'react'
import { Money } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ledgerTemplatesApi, type BookRow, type LedgerBook, type Template, type TemplateCode, type Threshold } from '@/lib/ledgerTemplates'
import { exportExcel, exportPdf } from './exportBook'

type Period = 'month' | 'quarter' | 'year'
function makePeriod(year: number, period: Period, part: number) {
  const month = period === 'month' ? part - 1 : period === 'quarter' ? (part - 1) * 3 : 0
  const span = period === 'month' ? 1 : period === 'quarter' ? 3 : 12
  const iso = (monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1) - 7 * 3600000).toISOString()
  const label = period === 'month' ? `Tháng ${part}/${year}` : period === 'quarter' ? `Quý ${part}/${year}` : `Năm ${year}`
  const file = period === 'month' ? `${year}-${String(part).padStart(2, '0')}` : period === 'quarter' ? `${year}-Q${part}` : `${year}`
  return { from: iso(month), to: iso(month + span), label, file }
}
function cellValue(row: BookRow, key: string) { return (row.cells as Record<string, string | number | null | undefined>)[key] ?? null }
function display(value: string | number | null, kind: string) {
  if (value === null || value === '') return '—'
  if (kind === 'money' && typeof value === 'number') return <Money value={value} />
  if (kind === 'date' && typeof value === 'string') return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
  return String(value)
}

export function TemplatesPage() {
  const [now] = useState(() => new Date())
  const [items, setItems] = useState<Template[] | null>(null)
  const [threshold, setThreshold] = useState<Threshold | null>(null)
  const [code, setCode] = useState<TemplateCode>(() => {
    const stored = localStorage.getItem('flowy-ledger-template')
    return stored === 'S2a-HKD' || stored === 'S2b-HKD' || stored === 'S2c-HKD' || stored === 'S2d-HKD' || stored === 'S2e-HKD' || stored === 'S3a-HKD' ? stored : 'S1a-HKD'
  })
  const [period, setPeriod] = useState<Period>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [part, setPart] = useState(now.getMonth() + 1)
  const [book, setBook] = useState<LedgerBook | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [extra, setExtra] = useState<string[]>([])
  const [extraName, setExtraName] = useState('')
  const [identity, setIdentity] = useState({ name: '', taxId: '', address: '', location: '' })
  useEffect(() => {
    let active = true
    const load = () => { Promise.all([ledgerTemplatesApi.list(), ledgerTemplatesApi.threshold()]).then(([list, limit]) => { if (active) { setItems(list.items); setThreshold(limit) } }).catch(() => { if (active) setError('Không tải được danh sách mẫu.') }) }
    load()
    const unsubscribe = ledgerTemplatesApi.subscribe(load)
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => {
    if (year < 1900 || year > 2100 || !Number.isInteger(year)) return
    let active = true
    const range = makePeriod(year, period, part)
    const load = () => { ledgerTemplatesApi.book(code, range.from, range.to).then((result) => { if (active) { setBook(result); setError('') } }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Không tải được sổ.') }) }
    load()
    const unsubscribe = ledgerTemplatesApi.subscribe(load)
    return () => { active = false; unsubscribe() }
  }, [code, period, year, part])
  function choose(value: TemplateCode) { setCode(value); setBook(null); setExtra([]); localStorage.setItem('flowy-ledger-template', value) }
  function choosePeriod(value: Period) { setBook(null); setPeriod(value); setPart(value === 'month' ? now.getMonth() + 1 : value === 'quarter' ? Math.floor(now.getMonth() / 3) + 1 : 1) }
  async function download(format: 'pdf' | 'xlsx') {
    if (!book) return
    setExporting(true); setError('')
    try { const range = makePeriod(year, period, part); const details = { ...identity, periodLabel: range.label }; const file = `${code}_${range.file}.${format}`; if (format === 'pdf') await exportPdf(book, details, extra, file); else await exportExcel(book, details, extra, file) }
    catch { setError('Không xuất được tệp. Bạn thử lại nhé.') } finally { setExporting(false) }
  }
  const selectClass = 'h-9 rounded-sm border border-input bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring'
  const range = makePeriod(year, period, part)
  return <div className="flex flex-col gap-5">
    <div><h2 className="text-base font-semibold">Chọn mẫu sổ</h2><p className="mt-1 text-sm text-muted-foreground">Mẫu đang dùng: {code}. Tất cả mẫu cần đối chiếu bản gốc trước khi sử dụng.</p>{threshold && <p className="mt-1 text-sm text-muted-foreground">{threshold.revenue <= threshold.threshold ? 'Có thể tham khảo S1a-HKD.' : 'Có thể tham khảo nhóm S2; hãy hỏi cơ quan thuế về phương pháp áp dụng.'} Đây không phải kết luận về nghĩa vụ thuế.</p>}</div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!items && !error && <p>Đang tải mẫu sổ…</p>}
    <div className="grid gap-2 sm:grid-cols-2">{items?.map((item) => <button type="button" key={item.code} onClick={() => choose(item.code)} aria-pressed={item.code === code} className={`rounded-sm border p-3 text-left ${item.code === code ? 'border-foreground' : 'border-border hover:bg-accent'}`}><b>{item.code} · {item.name}</b><span className="mt-1 block text-xs text-muted-foreground">{item.appliesTo}</span><span className="mt-1 block text-xs text-muted-foreground">Cần đối chiếu bản gốc</span></button>)}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">Kỳ<select className={selectClass} value={period} onChange={(event) => choosePeriod(event.target.value as Period)}><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm</option></select></label>
      {period !== 'year' && <label className="flex flex-col gap-1 text-sm">{period === 'month' ? 'Tháng' : 'Quý'}<select className={selectClass} value={part} onChange={(event) => { setBook(null); setPart(Number(event.target.value)) }}>{Array.from({ length: period === 'month' ? 12 : 4 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>}
      <label className="flex flex-col gap-1 text-sm">Năm<Input className="w-28" type="number" min={1900} max={2100} value={year || ''} onChange={(event) => { setBook(null); setYear(Number(event.target.value)) }} /></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-sm">Tên hộ kinh doanh<Input value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm">Mã số thuế<Input value={identity.taxId} onChange={(event) => setIdentity({ ...identity, taxId: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm">Địa chỉ<Input value={identity.address} onChange={(event) => setIdentity({ ...identity, address: event.target.value })} /></label><label className="flex flex-col gap-1 text-sm">Địa điểm kinh doanh<Input value={identity.location} onChange={(event) => setIdentity({ ...identity, location: event.target.value })} /></label></div>
    <div className="flex flex-wrap items-end gap-2"><label className="flex flex-col gap-1 text-sm">Thêm cột trống<Input maxLength={40} value={extraName} onChange={(event) => setExtraName(event.target.value)} /></label><Button variant="outline" disabled={!extraName.trim() || extra.length >= 3} onClick={() => { setExtra([...extra, extraName.trim()]); setExtraName('') }}>Thêm cột</Button>{extra.map((name, index) => <Button key={`${name}-${index}`} variant="ghost" onClick={() => setExtra(extra.filter((_, i) => i !== index))}>Bỏ cột {name}</Button>)}</div>
    {!book && !error && <p>Đang tải sổ…</p>}
    {book && <><div className="flex flex-wrap gap-2"><Button disabled={exporting} onClick={() => download('pdf')}>Xuất PDF</Button><Button variant="outline" disabled={exporting} onClick={() => download('xlsx')}>Xuất Excel</Button></div>
      <section className="flex flex-col gap-3 border border-border p-4"><div className="text-sm"><p>Hộ, cá nhân kinh doanh: {identity.name || '................................'}</p><p>Địa chỉ: {identity.address || '................................'} · Mã số thuế: {identity.taxId || '................................'}</p><p className="mt-2 text-right">Mẫu số {book.template.code} · Cần đối chiếu bản gốc</p><h3 className="mt-3 text-center font-semibold">{book.template.name.toLocaleUpperCase('vi-VN')}</h3><p className="mt-2">Địa điểm: {identity.location || '................................'} · Kỳ: {range.label} · Đơn vị tính: đồng</p></div>
        {book.sections.map((section, index) => <div key={`${section.title}-${index}`} className="flex flex-col gap-2">{section.title && <h4 className="font-semibold">{section.title}</h4>}{book.template.code === 'S2e-HKD' && <p className="text-sm text-muted-foreground">Số dư đầu kỳ: {section.openingBalance === null ? 'chưa có dữ liệu.' : <Money value={section.openingBalance} />}</p>}
          <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow>{book.template.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}{extra.map((name, i) => <TableHead key={`${name}-${i}`}>{name}</TableHead>)}</TableRow></TableHeader><TableBody>{section.rows.map((row) => <TableRow key={row.id}>{book.template.columns.map((column) => <TableCell key={column.key} className={column.value === 'money' ? 'text-right' : ''}>{display(cellValue(row, column.key), column.value)}</TableCell>)}{extra.map((name, i) => <TableCell key={`${name}-${i}`}>—</TableCell>)}</TableRow>)}{section.rows.length === 0 && <TableRow><TableCell colSpan={book.template.columns.length + extra.length}>Chưa có dữ liệu.</TableCell></TableRow>}<TableRow>{book.template.columns.map((column, i) => <TableCell key={column.key} className={column.value === 'money' ? 'text-right font-semibold' : 'font-semibold'}>{i === 0 ? 'Tổng cộng' : display(section.totals[column.key] ?? null, column.value)}</TableCell>)}{extra.map((name, i) => <TableCell key={`${name}-${i}`}>—</TableCell>)}</TableRow></TableBody></Table></div>
          {book.template.code === 'S2e-HKD' && <p className="text-sm text-muted-foreground">Số dư cuối kỳ: {section.closingBalance === null ? 'chưa có dữ liệu.' : <Money value={section.closingBalance} />}</p>}</div>)}
        {book.warnings.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}<p className="text-xs text-muted-foreground">Nguồn: {book.source} · Cách tính: tổng các khoản phù hợp trong kỳ; dữ liệu chưa đủ để xác định nghĩa vụ thuế.</p><p className="text-right text-sm">Ngày ...... tháng ...... năm ..........<br />Người đại diện hộ kinh doanh / cá nhân kinh doanh<br />(Ký, ghi rõ họ tên, đóng dấu nếu có)</p>
      </section>
    </>}
  </div>
}
