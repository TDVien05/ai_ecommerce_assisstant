import { useEffect, useState } from 'react'
import { BarChart, Money, ResultCard } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { financeApi, type FinanceSummary, type TimePoint, type TopProduct, type PartialReport } from '@/lib/finance'
import { api } from '@/lib/api'
import { isReal } from '@/lib/realApi'
import { range, type Period } from '@/lib/finance/period'
import { useLocation } from 'react-router-dom'

type Report = { summary: Pick<PartialReport,'revenue'|'expenses'|'cost'|'netProfit'>; points: TimePoint[]; products: TopProduct[]; unknownCount:number; missingCostCount:number; totalCount:number; classifiedCount:number; updatedAt:string }
export function ReportsPage() {
  const {search}=useLocation()
  const [period, setPeriod] = useState<Period>('week')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(()=>{const value=new URLSearchParams(search).get('period');if(value==='today'||value==='week'||value==='month')setPeriod(value)},[search])
  useEffect(() => {
    let active = true
    const query = range(period)
    const request:Promise<Report> = isReal('finance') ? api.get<PartialReport>('/finance/report',query).then((data)=>({summary:data,points:data.points,products:data.products,unknownCount:data.unknownCount,missingCostCount:data.missingCostCount,totalCount:data.totalCount,classifiedCount:data.classifiedCount,updatedAt:data.updatedAt})) : Promise.all([financeApi.summary(query),financeApi.timeseries(query),financeApi.topProducts(query)]).then(([summary,series,products]:[FinanceSummary,{points:TimePoint[]},{items:TopProduct[]}])=>({summary,points:series.points,products:products.items,unknownCount:0,missingCostCount:0,totalCount:1,classifiedCount:1,updatedAt:new Date().toISOString()}))
    request.then((data) => { if (active) { setReport(data); setError('') } }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Không tải được báo cáo.') })
    return () => { active = false }
  }, [period, retry])
  function selectPeriod(value: Period) { if (value !== period) { setReport(null); setError(''); setPeriod(value) } }
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-2">{([['today', 'Hôm nay'], ['week', '7 ngày'], ['month', 'Tháng này']] as const).map(([value, label]) => <Button key={value} size="sm" variant={period === value ? 'default' : 'outline'} aria-pressed={period === value} onClick={() => selectPeriod(value)}>{label}</Button>)}</div>
    {error && <p role="alert">{error} <Button variant="outline" onClick={() => { setError(''); setRetry((n) => n + 1) }}>Thử lại</Button></p>}
    {!report && !error && <p>Đang tải báo cáo…</p>}
    {report && <>
      {!report.totalCount && <p>Chưa có khoản thu chi trong kỳ.</p>}
      {report.totalCount>0 && !report.classifiedCount && <p>Chưa có khoản doanh thu hoặc chi phí kinh doanh được phân loại trong kỳ.</p>}
      {(report.unknownCount>0 || report.missingCostCount>0) && <p>Đây là báo cáo từng phần: {report.unknownCount} khoản chưa phân loại hoặc phân loại không hợp lệ, {report.missingCostCount} khoản doanh thu thiếu giá vốn hoặc cần xác minh giá vốn bằng 0. Chưa đủ dữ liệu để tính lãi.</p>}
      <ResultCard metrics={[{ label: 'Doanh thu đã phân loại', value: report.summary.revenue }, { label: 'Chi phí đã phân loại', value: report.summary.expenses }, ...(report.summary.netProfit===null?[]:[{ label: 'Lãi tạm tính', value: report.summary.netProfit }])]} source={isReal('finance') ? 'sổ thu chi và đơn hàng' : 'sổ thu chi và đơn hàng (dữ liệu mẫu)'} updatedAt={new Date(report.updatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} how={[{ label: 'Doanh thu đã phân loại', value: report.summary.revenue }, ...(report.summary.cost===null?[]:[{label:'Trừ giá vốn',value:report.summary.cost}]), { label: 'Trừ chi phí đã phân loại', value: report.summary.expenses }, ...(report.summary.netProfit===null?[]:[{ label: 'Lãi tạm tính', value: report.summary.netProfit, total: true }])]} />
      <section className="flex flex-col gap-3"><h2 className="text-base font-semibold">Doanh thu theo ngày</h2>{report.points.length ? <BarChart points={report.points.map((point) => ({ label: point.date, value: point.revenue }))} /> : <p className="text-muted-foreground">Chưa có doanh thu theo ngày.</p>}
        {!!report.points.length && <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead className="text-right">Doanh thu</TableHead></TableRow></TableHeader><TableBody>{report.points.map((point) => <TableRow key={point.date}><TableCell>{point.date}</TableCell><TableCell className="text-right"><Money value={point.revenue} /></TableCell></TableRow>)}</TableBody></Table></div>}
        <p className="text-xs text-muted-foreground">Nguồn: sổ thu chi{isReal('finance') ? '' : ' (dữ liệu mẫu)'}; xem cách tính ở thẻ tổng.</p>
      </section>
      <section className="flex flex-col gap-3"><h2 className="text-base font-semibold">Sản phẩm bán chạy</h2>{report.products.length === 0 ? <p className="text-muted-foreground">Chưa có sản phẩm bán trong kỳ.</p> : <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow><TableHead>Sản phẩm</TableHead><TableHead>Số lượng</TableHead><TableHead className="text-right">Doanh thu</TableHead></TableRow></TableHeader><TableBody>{report.products.map((product) => <TableRow key={product.productId}><TableCell>{product.name}</TableCell><TableCell>{product.quantity}</TableCell><TableCell className="text-right"><Money value={product.revenue} /></TableCell></TableRow>)}</TableBody></Table></div>}<p className="text-xs text-muted-foreground">Nguồn: đơn hàng đã thanh toán{isReal('finance') ? '' : ' (dữ liệu mẫu)'}.</p></section>
    </>}
  </div>
}
