import { useEffect, useState } from 'react'
import { BarChart, Money, ResultCard } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { financeApi, type FinanceSummary, type TimePoint, type TopProduct } from '@/lib/finance'

type Period = 'today' | 'week' | 'month'
type Report = { summary: FinanceSummary; points: TimePoint[]; products: TopProduct[] }
function range(period: Period) {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(1)
  return { from: start.toISOString(), to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString() }
}
export function ReportsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const query = range(period)
    Promise.all([financeApi.summary(query), financeApi.timeseries(query), financeApi.topProducts(query)]).then(([summary, series, products]) => {
      if (active) { setReport({ summary, points: series.points, products: products.items }); setError('') }
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Không tải được báo cáo.') })
    return () => { active = false }
  }, [period, retry])
  function selectPeriod(value: Period) { if (value !== period) { setReport(null); setError(''); setPeriod(value) } }
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-2">{([['today', 'Hôm nay'], ['week', '7 ngày'], ['month', 'Tháng này']] as const).map(([value, label]) => <Button key={value} size="sm" variant={period === value ? 'default' : 'outline'} aria-pressed={period === value} onClick={() => selectPeriod(value)}>{label}</Button>)}</div>
    {error && <p role="alert">{error} <Button variant="outline" onClick={() => { setError(''); setRetry((n) => n + 1) }}>Thử lại</Button></p>}
    {!report && !error && <p>Đang tải báo cáo…</p>}
    {report && <>
      <ResultCard metrics={[{ label: 'Doanh thu', value: report.summary.revenue }, { label: 'Chi phí', value: report.summary.expenses }, { label: 'Lãi tạm tính', value: report.summary.netProfit }]} source="sổ thu chi và đơn hàng (dữ liệu mẫu)" updatedAt="chưa có thời điểm" how={[{ label: 'Doanh thu', value: report.summary.revenue }, { label: 'Trừ giá vốn', value: report.summary.cost }, { label: 'Trừ chi phí', value: report.summary.expenses }, { label: 'Lãi tạm tính', value: report.summary.netProfit, total: true }]} />
      <section className="flex flex-col gap-3"><h2 className="text-base font-semibold">Doanh thu theo ngày</h2><BarChart points={report.points.map((point) => ({ label: point.date, value: point.revenue }))} />
        {!!report.points.length && <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead className="text-right">Doanh thu</TableHead></TableRow></TableHeader><TableBody>{report.points.map((point) => <TableRow key={point.date}><TableCell>{point.date}</TableCell><TableCell className="text-right"><Money value={point.revenue} /></TableCell></TableRow>)}</TableBody></Table></div>}
        <p className="text-xs text-muted-foreground">Nguồn: sổ thu chi (dữ liệu mẫu); xem cách tính ở thẻ tổng.</p>
      </section>
      <section className="flex flex-col gap-3"><h2 className="text-base font-semibold">Sản phẩm bán chạy</h2>{report.products.length === 0 ? <p className="text-muted-foreground">Chưa có sản phẩm bán trong kỳ.</p> : <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Sản phẩm</TableHead><TableHead>Số lượng</TableHead><TableHead className="text-right">Doanh thu</TableHead></TableRow></TableHeader><TableBody>{report.products.map((product) => <TableRow key={product.productId}><TableCell>{product.name}</TableCell><TableCell>{product.quantity}</TableCell><TableCell className="text-right"><Money value={product.revenue} /></TableCell></TableRow>)}</TableBody></Table></div>}<p className="text-xs text-muted-foreground">Nguồn: đơn hàng đã thanh toán (dữ liệu mẫu).</p></section>
    </>}
  </div>
}
