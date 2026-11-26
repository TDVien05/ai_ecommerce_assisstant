import { Button } from '@/components/ui/button'
import { Block, BlockBody, BlockFooter, BlockHeader, BlockTitle } from './Block'
import { RiskBadge } from './RiskBadge'

type RiskAlertProps = {
  /** "Đơn #1042 có dấu hiệu lừa đảo" */
  title: string
  level: 'mid' | 'high'
  /** Mỗi lý do một câu có số liệu. */
  reasons: string[]
  /** Hành động an toàn, ví dụ "Giữ đơn, chưa giao". Không có nút "Vẫn duyệt" ở đây. */
  safeActionLabel: string
  onSafeAction: () => void
  onView?: () => void
  /** "Phát hiện lúc 21:15 từ tin nhắn Messenger" */
  detectedNote?: string
}

/** Cảnh báo lừa đảo mức Trung bình/Cao. Mức Thấp chỉ gắn RiskBadge, không bật khối này. */
export function RiskAlert({ title, level, reasons, safeActionLabel, onSafeAction, onView, detectedNote }: RiskAlertProps) {
  return (
    <Block tone={level === 'high' ? 'danger' : 'default'} className={level === 'mid' ? 'border-risk-mid' : undefined}>
      <BlockHeader>
        <BlockTitle>{title}</BlockTitle>
        <RiskBadge level={level} />
      </BlockHeader>
      <BlockBody>
        <ul className="m-0 flex flex-col gap-0.5 pl-[18px]">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </BlockBody>
      <BlockFooter>
        <Button size="lg" onClick={onSafeAction}>
          {safeActionLabel}
        </Button>
        {onView && (
          <Button size="lg" variant="outline" onClick={onView}>
            Xem đơn
          </Button>
        )}
        <span className="flex-1" />
        {detectedNote && <span className="text-xs text-muted-foreground">{detectedNote}</span>}
      </BlockFooter>
    </Block>
  )
}
