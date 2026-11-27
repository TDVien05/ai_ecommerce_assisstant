import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { toastDone } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shopApi, type ShopSettings } from '@/lib/shop'

export function SettingsPage() {
  const [shop, setShop] = useState<ShopSettings | null>(null)
  const [saved, setSaved] = useState<ShopSettings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function load() { shopApi.get().then((result) => { setShop(result.shop); setSaved(result.shop); setError('') }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không tải được cài đặt.')) }
  useEffect(() => { load() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!shop || !saved) return
    const previous = saved; setBusy(true); setError('')
    try {
      const result = await shopApi.update(shop); setShop(result.shop); setSaved(result.shop)
      toastDone('Đã lưu cài đặt cửa hàng.', () => { shopApi.update(previous).then((restored) => { setShop(restored.shop); setSaved(restored.shop) }).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Không hoàn tác được.')) })
    } catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được cài đặt.') } finally { setBusy(false) }
  }
  return <div className="max-w-xl">{error && <p role="alert">{error} <Button variant="outline" onClick={load}>Thử lại</Button></p>}{!shop && !error && <p>Đang tải cài đặt…</p>}{shop && <form className="flex flex-col gap-4" onSubmit={submit}>
    <label className="flex flex-col gap-2">Tên cửa hàng<Input required value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} /></label>
    <label className="flex flex-col gap-2">Mã ngân hàng<Input value={shop.bankCode ?? ''} onChange={(e) => setShop({ ...shop, bankCode: e.target.value || null })} /></label>
    <label className="flex flex-col gap-2">Số tài khoản<Input value={shop.bankAccountNumber ?? ''} onChange={(e) => setShop({ ...shop, bankAccountNumber: e.target.value || null })} /></label>
    <label className="flex flex-col gap-2">Tên chủ tài khoản<Input value={shop.bankAccountName ?? ''} onChange={(e) => setShop({ ...shop, bankAccountName: e.target.value || null })} /></label>
    <div><Button type="submit" disabled={busy}>Lưu cài đặt</Button></div><p className="text-xs text-muted-foreground">Thông tin cửa hàng và tài khoản ngân hàng là dữ liệu mẫu.</p>
  </form>}</div>
}
