import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Block, BlockBody, BlockFooter, BlockHeader } from './Block'
import { RiskBadge } from './RiskBadge'
import type { RiskLevel } from './types'

type ProactiveNoticeProps = {
  /** Câu đầu, in đậm: đối tượng + vấn đề. "Đơn #1042 có dấu hiệu lừa đảo." */
  headline: string
  /** Bằng chứng cụ thể và việc AI đã tự làm (chỉ việc an toàn, đảo ngược được). */
  detail: React.ReactNode
  risk?: RiskLevel
  actionLabel?: string
  onOpenThread: () => void
  onDismiss?: () => void
}

/** Tin AI tự gửi vào Chat trung tâm khi có chuyện, không chờ người dùng hỏi. */
export function ProactiveNotice({
  headline,
  detail,
  risk,
  actionLabel = 'Mở luồng',
  onOpenThread,
  onDismiss,
}: ProactiveNoticeProps) {
  return (
    <Block tone="attention">
      <BlockHeader>
        <span className="flex-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          AI chủ động báo
        </span>
        {risk && <RiskBadge level={risk} />}
      </BlockHeader>
      <BlockBody>
        <p className="m-0">
          <b className="font-semibold">{headline}</b> {detail}
        </p>
      </BlockBody>
      <BlockFooter>
        <Button size="lg" onClick={onOpenThread}>
          {actionLabel}
          <ArrowRight />
        </Button>
        {onDismiss && (
          <Button size="lg" variant="outline" onClick={onDismiss}>
            Bỏ qua cảnh báo
          </Button>
        )}
      </BlockFooter>
    </Block>
  )
}
