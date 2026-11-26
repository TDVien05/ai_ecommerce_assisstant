import { Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Block, BlockBody, BlockFooter, BlockHeader, BlockTitle } from './Block'
import { StateLabel } from './ThreadStatusIcon'
import type { StepStatus } from './types'

export type AgentStepItem = { label: string; meta?: string; status: StepStatus }

export type AgentQuestion = {
  id: string
  /** Ví dụ: "−350.000 ₫ · CK NGUYEN VAN B" */
  label: React.ReactNode
  options: string[]
  value?: string
}

type RunState = 'working' | 'waiting' | 'done' | 'undone' | 'failed'

const STATE_TEXT: Record<RunState, string> = {
  working: 'Đang làm',
  waiting: 'Chờ bạn duyệt',
  done: 'Đã xong',
  undone: 'Đã hoàn tác',
  failed: 'Lỗi',
}

type AgentStepProps = {
  /** Hành động + đối tượng: "Ghi 14 giao dịch vào sổ" */
  title: string
  state: RunState
  steps: AgentStepItem[]
  questions?: AgentQuestion[]
  onAnswer?: (questionId: string, option: string) => void
  /** Nhãn nút Duyệt, luôn nói rõ việc: "Duyệt và ghi sổ" */
  approveLabel?: string
  onApprove?: () => void
  onEdit?: () => void
  onUndo?: () => void
  onRetry?: () => void
  /** Dòng nói hậu quả khi hoàn tác, bắt buộc khi có onUndo. */
  undoNote?: string
  /** Dòng kết quả khi state="done": "Đã ghi 14 giao dịch lúc 21:42" */
  doneText?: string
}

/**
 * Một lần AI làm việc: các bước, câu hỏi lại, nút Duyệt/Hoàn tác.
 * Mọi thay đổi dữ liệu do AI đề xuất phải đi qua khối này. Nằm trong luồng việc.
 */
export function AgentStep(props: AgentStepProps) {
  const { title, state, steps, questions = [], approveLabel = 'Duyệt', undoNote, doneText } = props
  return (
    <Block tone={state === 'waiting' ? 'attention' : state === 'failed' ? 'danger' : 'default'}>
      <BlockHeader>
        <BlockTitle>{title}</BlockTitle>
        <StateLabel muted={state === 'done' || state === 'undone'}>{STATE_TEXT[state]}</StateLabel>
      </BlockHeader>
      <BlockBody>
        {state === 'done' && doneText ? (
          <div className="flex items-center gap-2 font-medium text-risk-low">
            <Check className="size-4" />
            {doneText}
          </div>
        ) : (
          <StepList steps={steps} />
        )}
        {state === 'waiting' && questions.length > 0 && (
          <div className="flex flex-col gap-2 bg-muted px-3 py-2.5">
            {questions.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="money">{q.label}</span>
                <Segmented options={q.options} value={q.value} onChange={(o) => props.onAnswer?.(q.id, o)} />
              </div>
            ))}
          </div>
        )}
      </BlockBody>
      {state === 'waiting' && (
        <BlockFooter>
          <Button size="lg" onClick={props.onApprove}>
            <Check />
            {approveLabel}
          </Button>
          {props.onEdit && (
            <Button size="lg" variant="outline" onClick={props.onEdit}>
              Sửa trước
            </Button>
          )}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">Ghi xong vẫn hoàn tác được</span>
        </BlockFooter>
      )}
      {state === 'done' && props.onUndo && (
        <BlockFooter>
          <Button size="sm" variant="outline" onClick={props.onUndo}>
            <Undo2 />
            Hoàn tác
          </Button>
          {undoNote && <span className="text-xs text-muted-foreground">{undoNote}</span>}
        </BlockFooter>
      )}
      {state === 'failed' && props.onRetry && (
        <BlockFooter>
          <Button size="lg" variant="outline" onClick={props.onRetry}>
            Thử lại
          </Button>
        </BlockFooter>
      )}
    </Block>
  )
}

/** Danh sách bước với ô vuông 16px: đặc = xong, nét đứt = cần bạn, vòng xoay = đang chạy. */
export function StepList({ steps }: { steps: AgentStepItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((s, i) => (
        <li key={i} className="grid grid-cols-[18px_1fr] items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 grid size-4 place-items-center border-[1.5px] border-foreground',
              s.status === 'done' && 'bg-foreground text-background',
              s.status === 'needs' && 'border-dashed',
              s.status === 'running' &&
                'animate-spin rounded-full border-muted-foreground border-t-foreground motion-reduce:animate-none',
              s.status === 'failed' && 'border-risk-high text-risk-high',
            )}
          >
            {s.status === 'done' && <Check className="size-[11px]" strokeWidth={3} />}
          </span>
          <span className={cn(s.status === 'skipped' && 'text-muted-foreground line-through')}>
            {s.label}
            {s.meta && <small className="block text-xs leading-4 text-muted-foreground">{s.meta}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Nút chọn liền nhau để AI hỏi lại, thay cho bắt người dùng gõ. */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[]
  value?: string
  onChange?: (option: string) => void
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-sm border">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange?.(o)}
          className={cn(
            'h-7 border-r bg-background px-2.5 text-[13px] last:border-r-0',
            o === value && 'bg-primary text-primary-foreground',
          )}
        >
          {o}
        </button>
      ))}
    </span>
  )
}
