import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Block, BlockBody, BlockFooter, BlockHeader, BlockTitle } from './Block'
import { StateLabel, ThreadStatusIcon } from './ThreadStatusIcon'
import { THREAD_STATUS_LABEL, type ThreadStatus } from './types'

type ThreadSummaryProps = {
  title: string
  status: Exclude<ThreadStatus, 'running'>
  updatedAt: string
  /** 1 đến 2 câu kết quả, có số cụ thể. */
  summary: React.ReactNode
  onOpen: () => void
}

/**
 * Thẻ AI gửi vào Chat trung tâm khi một luồng chờ duyệt hoặc xong.
 * Mỗi luồng chỉ một thẻ; khi trạng thái đổi thì cập nhật thẻ cũ.
 * Không đặt nút Duyệt ở đây: "Vào duyệt" mở luồng để người dùng thấy đủ chi tiết.
 */
export function ThreadSummary({ title, status, updatedAt, summary, onOpen }: ThreadSummaryProps) {
  const waiting = status === 'waiting' || status === 'alert'
  return (
    <Block tone={waiting ? 'attention' : 'default'}>
      <BlockHeader className="gap-2.5">
        <ThreadStatusIcon status={status} />
        <BlockTitle>{title}</BlockTitle>
        <StateLabel muted={!waiting}>
          {THREAD_STATUS_LABEL[status]}
          {status === 'done' && ` · ${updatedAt}`}
        </StateLabel>
      </BlockHeader>
      <BlockBody>
        <p className="m-0">{summary}</p>
      </BlockBody>
      <BlockFooter>
        {waiting ? (
          <>
            <Button size="lg" onClick={onOpen}>
              Vào duyệt
              <ArrowRight />
            </Button>
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">Luồng cập nhật lúc {updatedAt}</span>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-[3px]"
          >
            Mở luồng
            <ArrowRight className="size-4" />
          </button>
        )}
      </BlockFooter>
    </Block>
  )
}
