import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Nhãn AI: ô vuông 24px nền primary. Dấu hiệu duy nhất cho nội dung do AI tạo. */
export function AiMark({ live }: { live?: boolean }) {
  return (
    <span
      aria-label="AI"
      className={cn(
        'grid size-6 shrink-0 place-items-center bg-primary text-[10px] font-bold tracking-wide text-primary-foreground',
        live && 'animate-pulse motion-reduce:animate-none',
      )}
    >
      AI
    </span>
  )
}

/** Tin nhắn của AI: không có khung nền; chữ ngắn đi trước, các khối (AgentStep, ResultCard...) nằm dưới. */
export function AssistantMessage({
  children,
  live,
  className,
}: {
  children?: React.ReactNode
  live?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-[24px_minmax(0,1fr)] gap-3', className)}>
      <AiMark live={live} />
      <div className="flex min-w-0 flex-col gap-2.5 [&>p]:m-0">{children ?? <TypingIndicator />}</div>
    </div>
  )
}

/** Tin nhắn của người dùng: bên phải, nền secondary, tối đa 80% cột. */
export function UserMessage({ children, files }: { children: React.ReactNode; files?: string[] }) {
  return (
    <div className="flex max-w-[80%] flex-col gap-2 self-end rounded-sm bg-secondary px-3.5 py-2.5 text-secondary-foreground">
      <span>{children}</span>
      {files?.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1.5 self-start rounded-sm border bg-background px-2 py-1 text-xs"
        >
          <FileText className="size-3.5" />
          {f}
        </span>
      ))}
    </div>
  )
}

export function TypingIndicator() {
  return (
    <span className="inline-flex h-5 items-center gap-1" aria-label="AI đang trả lời">
      {[0, 200, 400].map((d) => (
        <i
          key={d}
          className="size-[5px] animate-pulse bg-muted-foreground motion-reduce:animate-none"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  )
}

/** Dải ngày giữa feed: "HÔM NAY, 26/11". */
export function DayDivider({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-center text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}
