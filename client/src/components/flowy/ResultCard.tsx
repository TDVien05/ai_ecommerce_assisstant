import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Money } from './Money'

export type ResultMetric = {
  label: string
  value: number
  unit?: 'count'
  /** "▲ 12% so với hôm qua". Bỏ trống thì ghi chú phụ như số giao dịch. */
  delta?: string
  /** good = risk-low, bad = risk-high, neutral = muted */
  tone?: 'good' | 'bad' | 'neutral'
}

export type HowLine = { label: string; value: number; total?: boolean; unit?: 'count' }

type ResultCardProps = {
  metrics: ResultMetric[]
  /** "sổ thu chi" */
  source: string
  /** "21:42" */
  updatedAt: string
  /** Các dòng cộng trừ ra con số, hiện khi bấm "Cách tính". */
  how?: HowLine[]
}

/** Thẻ số liệu trong chat. Số luôn lấy từ sổ (server), không do AI tự tính. Tối đa 3 ô. */
export function ResultCard({ metrics, source, updatedAt, how }: ResultCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid border sm:grid-cols-3">
        {metrics.slice(0, 3).map((m) => (
          <div
            key={m.label}
            className="flex min-w-0 flex-col gap-0.5 border-b px-3.5 py-3 last:border-0 sm:border-r sm:border-b-0"
          >
            <span className="text-xs text-muted-foreground">{m.label}</span>
            {m.unit === 'count' ? <span className="text-xl font-semibold tabular-nums">{new Intl.NumberFormat('vi-VN').format(m.value)}</span> : <Money value={m.value} size="lg" />}
            {m.delta && (
              <span
                className={cn(
                  'money text-xs',
                  m.tone === 'good' && 'text-risk-low',
                  m.tone === 'bad' && 'text-risk-high',
                  (!m.tone || m.tone === 'neutral') && 'text-muted-foreground',
                )}
              >
                {m.delta}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        <span>
          Nguồn: {source}, cập nhật {updatedAt}
        </span>
        {how && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="text-foreground underline underline-offset-[3px]"
          >
            Cách tính
          </button>
        )}
      </div>
      {open && how && (
        <div className="flex flex-col gap-1 bg-muted px-3 py-2.5 text-[13px]">
          {how.map((l) => (
            <div key={l.label} className={cn('flex justify-between gap-3', l.total && 'border-t pt-1 font-semibold')}>
              <span>{l.label}</span>
              {l.unit === 'count' ? <span className="tabular-nums">{new Intl.NumberFormat('vi-VN').format(l.value)}</span> : <Money value={l.value} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
