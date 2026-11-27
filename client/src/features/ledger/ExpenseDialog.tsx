import { useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { toastDone } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { financeApi, type LedgerCategory, type LedgerType } from '@/lib/finance'
import { categoryLabels } from './categoryLabels'

const categories: Record<LedgerType, LedgerCategory[]> = { INCOME: ['SALES', 'OTHER'], EXPENSE: ['SHIPPING', 'ADS', 'INVENTORY', 'OTHER'] }
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
export function ExpenseDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [type, setType] = useState<LedgerType>('EXPENSE')
  const [category, setCategory] = useState<LedgerCategory>('SHIPPING')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(localDate)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const number = Number(amount)
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(number) || number <= 0 || !date) { setError('Nhập số tiền nguyên dương và ngày hợp lệ.'); return }
    setSaving(true); setError('')
    try {
      const { entry, message } = await financeApi.createEntry({ type, category, amount: number, note, occurredAt: new Date(`${date}T12:00:00`).toISOString() })
      toastDone(message, () => { financeApi.deleteEntry(entry.id).then(onChanged).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Không hoàn tác được.')) })
      onChanged(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Không ghi được. Bạn thử lại nhé.'); setSaving(false) }
  }
  const inputClass = 'h-9 w-full rounded-sm border border-input bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring'
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto rounded-none shadow-overlay sm:max-w-md"><DialogHeader><DialogTitle>Ghi khoản thu chi</DialogTitle></DialogHeader>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">Loại<select className={inputClass} value={type} onChange={(event) => { const next = event.target.value as LedgerType; setType(next); setCategory(categories[next][0]) }}><option value="INCOME">Thu</option><option value="EXPENSE">Chi</option></select></label>
      <label className="flex flex-col gap-2">Nhóm<select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as LedgerCategory)}>{categories[type].map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label>
      <label className="flex flex-col gap-2">Số tiền (đồng)<Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
      <label className="flex flex-col gap-2">Ghi chú<Input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <label className="flex flex-col gap-2">Ngày<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      {error && <p role="alert" className="m-0 text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Đóng</Button><Button type="submit" disabled={saving}>{type === 'INCOME' ? 'Ghi khoản thu' : 'Ghi khoản chi'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
