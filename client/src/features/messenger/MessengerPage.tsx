import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { conversationsApi, type ChatLine, type Conversation } from '@/lib/conversations'

export function MessengerPage() {
  const [items, setItems] = useState<Conversation[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [lines, setLines] = useState<ChatLine[] | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function load() { conversationsApi.list().then((result) => { setItems(result.items); setSelected((previous) => previous ?? result.items[0]?.id ?? null); setError('') }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không tải được hội thoại.')) }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!selected) return
    let active = true
    conversationsApi.messages(selected).then((result) => { if (active) setLines(result.items) }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Không tải được tin nhắn.') })
    return () => { active = false }
  }, [selected])
  const current = items?.find((item) => item.id === selected)
  async function toggle() {
    if (!current) return
    setBusy(true)
    try { await conversationsApi.update(current.id, { ai_paused: !current.aiPaused }); load() } catch (err) { setError(err instanceof Error ? err.message : 'Không đổi được trạng thái AI.') } finally { setBusy(false) }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!selected || !message.trim()) return
    setBusy(true)
    try { const result = await conversationsApi.send(selected, { content: message }); setLines((previous) => [...(previous ?? []), result.message]); setMessage(''); load() } catch (err) { setError(err instanceof Error ? err.message : 'Không gửi được tin nhắn.') } finally { setBusy(false) }
  }
  return <div className="flex flex-col gap-4">
    {error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}
    {!items && !error && <p>Đang tải hội thoại…</p>}
    {items?.length === 0 && <p className="text-muted-foreground">Chưa có hội thoại.</p>}
    {!!items?.length && <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]"><div className="flex flex-col gap-2">{items.map((item) => <button key={item.id} type="button" onClick={() => { setLines(null); setSelected(item.id) }} aria-pressed={selected === item.id} className="rounded-sm border border-border p-3 text-left hover:bg-accent"><b>{item.customerName}</b><span className="block truncate text-xs text-muted-foreground">{item.lastMessage || 'Chưa có tin nhắn'}</span></button>)}</div>
      <div className="min-w-0 border border-border p-4">{current ? <><div className="flex flex-wrap items-center gap-2"><b>{current.customerName}</b><span className="text-muted-foreground">{current.aiPaused ? 'AI đang tắt' : 'AI đang bật'}</span><span className="flex-1" /><Button variant="outline" disabled={busy} onClick={toggle}>{current.aiPaused ? 'Bật AI cho hội thoại này' : 'Tắt AI cho hội thoại này'}</Button></div>
        <div className="my-4 flex min-h-32 flex-col gap-2">{lines === null ? <p>Đang tải tin nhắn…</p> : lines.length === 0 ? <p className="text-muted-foreground">Chưa có tin nhắn.</p> : lines.map((line) => <div key={line.id} className="border border-border p-3"><span className="text-xs text-muted-foreground">{line.role === 'user' ? 'Khách' : 'Cửa hàng / AI'}</span><p className="m-0 break-words">{line.content}</p></div>)}</div>
        <form className="flex gap-2" onSubmit={send}><Input aria-label="Tin nhắn gửi khách" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Nhập tin nhắn" /><Button type="submit" disabled={busy || !message.trim()}>Gửi tin</Button></form></> : <p className="text-muted-foreground">Chọn hội thoại để xem tin nhắn.</p>}</div>
    </div>}
    <p className="text-xs text-muted-foreground">Dữ liệu hội thoại mẫu.</p>
  </div>
}
