import { cn } from '@/lib/utils'
import { THREAD_STATUS_LABEL, type ThreadStatus } from './types'

/** Ký hiệu 10px cho trạng thái luồng: đỏ = cảnh báo, đen = chờ duyệt, vòng xoay = đang chạy, rỗng = xong. */
export function ThreadStatusIcon({ status, className }: { status: ThreadStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={THREAD_STATUS_LABEL[status]}
      className={cn(
        'block size-2.5 shrink-0',
        status === 'alert' && 'bg-risk-high',
        status === 'waiting' && 'bg-foreground',
        status === 'running' &&
          'animate-spin rounded-full border-[1.5px] border-muted-foreground border-t-foreground motion-reduce:animate-none',
        status === 'done' && 'border-[1.5px] border-muted-foreground',
        className,
      )}
    />
  )
}

/** Nhãn trạng thái viết hoa có viền, đặt ở góc phải khối AI hoặc thanh trên của luồng. */
export function StateLabel({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm border border-current px-1.5 py-px text-[11px] leading-4 font-semibold tracking-[0.06em] uppercase',
        muted && 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}
