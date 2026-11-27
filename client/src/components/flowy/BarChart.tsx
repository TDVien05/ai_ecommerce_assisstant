import { Money } from './Money'

/** Các giá trị do nguồn dữ liệu cung cấp; biểu đồ chỉ chuẩn hóa chiều cao. */
export function BarChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(0, ...points.map((point) => point.value))
  if (!points.length) return <p className="text-muted-foreground">Chưa có dữ liệu cho kỳ này.</p>
  return <div className="overflow-x-auto"><div className="flex min-w-max items-end gap-4 border-b border-border px-2 pt-4" role="img" aria-label="Biểu đồ doanh thu theo ngày; bảng số liệu ở bên dưới">
    {points.map((point) => <div key={point.label} className="flex w-16 flex-col items-center gap-2"><div className="flex h-32 w-full items-end justify-center"><div className="w-8 bg-chart-1" style={{ height: max > 0 ? `${Math.max(0, point.value / max * 100)}%` : '0%' }} aria-label={`${point.label}: ${new Intl.NumberFormat('vi-VN').format(point.value)} đồng`} /></div><span className="text-xs text-muted-foreground">{point.label}</span><span className="sr-only"><Money value={point.value} /></span></div>)}
  </div></div>
}
