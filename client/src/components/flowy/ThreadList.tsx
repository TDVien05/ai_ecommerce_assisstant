import { cn } from '@/lib/utils'
import { ThreadStatusIcon } from './ThreadStatusIcon'
import type { ThreadStatus } from './types'

export type ThreadItem = {
  id: string
  /** Việc + đối tượng: "Ghi sổ sao kê 26/11", "Kiểm tra đơn #1042" */
  title: string
  status: ThreadStatus
  /** "21:40" hoặc để trống khi đang chạy */
  updatedAt?: string
}

const ORDER: Record<ThreadStatus, number> = { alert: 0, waiting: 1, running: 2, done: 3 }

/** Danh sách luồng việc trong sidebar. Tự sắp: cảnh báo, chờ duyệt, đang chạy, xong. */
export function ThreadList({
  threads,
  activeId,
  onSelect,
}: {
  threads: ThreadItem[]
  activeId?: string
  onSelect: (id: string) => void
}) {
  const sorted = [...threads].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  return (
    <div className="flex flex-col gap-px">
      {sorted.map((t) => {
        const on = t.id === activeId
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'grid h-[34px] w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left',
              on ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent',
            )}
          >
            <ThreadStatusIcon status={t.status} className={on && t.status === 'waiting' ? 'bg-current' : undefined} />
            <span className="truncate">{t.title}</span>
            <span className={cn('text-[11px]', on ? 'opacity-70' : 'text-muted-foreground')}>
              {t.status === 'running' ? 'đang chạy' : t.updatedAt}
            </span>
          </button>
        )
      })}
    </div>
  )
}
