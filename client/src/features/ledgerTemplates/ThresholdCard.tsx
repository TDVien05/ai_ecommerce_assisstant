import { useEffect, useState } from 'react'
import { ResultCard } from '@/components/flowy'
import { ledgerTemplatesApi, type Threshold } from '@/lib/ledgerTemplates'

export function ThresholdCard() {
  const [data, setData] = useState<Threshold | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () => { ledgerTemplatesApi.threshold().then((result) => { if (active) { setData(result); setError('') } }).catch(() => { if (active) setError('Không tải được doanh thu lũy kế.') }) }
    load()
    const unsubscribe = ledgerTemplatesApi.subscribe(load)
    return () => { active = false; unsubscribe() }
  }, [])
  return <section className="flex flex-col gap-3 border border-border p-4"><h2 className="text-base font-semibold">Doanh thu lũy kế năm</h2>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Đang tải doanh thu…</p>}
    {data && <ResultCard metrics={[{ label: `Doanh thu kinh doanh năm ${data.year}`, value: data.revenue }]} source={data.source} updatedAt={new Date(data.updatedAt).toLocaleString('vi-VN')} how={[{ label: 'Doanh thu kinh doanh đã ghi trong năm', value: data.revenue, total: true }]} />}
    <p className="text-sm text-muted-foreground">Số này chỉ gồm các khoản đã ghi trong sổ và không đủ để xác định doanh thu của toàn hộ.</p>
    <p className="text-sm text-muted-foreground">Nếu thuộc trường hợp quy định và doanh thu lũy kế vượt 1 tỷ đồng, thời hạn đăng ký hóa đơn điện tử có thể được tính từ cuối kỳ tính thuế. Hãy liên hệ cơ quan thuế để xác định nghĩa vụ và thời hạn áp dụng.</p>
    <a className="text-sm underline underline-offset-4" href="https://congbaocdn.chinhphu.vn/180507251028987904/2026/5/14/469455-1778231931_v1_1778720623_signed.pdf" target="_blank" rel="noreferrer">Khoản 2 Điều 1 Nghị định 141/2026/NĐ-CP · Công báo</a>
  </section>
}
