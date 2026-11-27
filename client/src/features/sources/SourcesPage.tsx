import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sourcesApi, type Source } from '@/lib/sources'

const names: Record<Source['id'], string> = { messenger: 'Messenger', bank: 'Ngân hàng', statement: 'Sao kê' }
export function SourcesPage() {
  const [items, setItems] = useState<Source[] | null>(null)
  const [error, setError] = useState('')
  function load() { sourcesApi.list().then((result) => { setItems(result.items); setError('') }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không tải được nguồn dữ liệu.')) }
  useEffect(() => { load() }, [])
  return <div className="flex flex-col gap-3">{error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}{!items && !error && <p>Đang tải nguồn dữ liệu…</p>}{items?.length === 0 && <p className="text-muted-foreground">Chưa có nguồn dữ liệu.</p>}{items?.map((source) => <div key={source.id} className="flex flex-wrap items-center gap-3 border border-border p-4"><b>{names[source.id]}</b><Badge variant="outline">{source.status === 'CONNECTED' ? 'Đã kết nối' : 'Chưa kết nối'}</Badge><span className="text-muted-foreground">{source.detail}</span></div>)}<p className="text-xs text-muted-foreground">Trạng thái nguồn dữ liệu mẫu.</p></div>
}
