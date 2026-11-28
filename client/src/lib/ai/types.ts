// Hợp đồng giữa giao diện và AI. Giao diện chỉ phụ thuộc file này.
// Mọi kiểu đều là JSON thuần để server trả được y hệt. Xem docs/AI_AGENT.md#giao-diện-chủ-shop

export type ConversationId = string
/** Id của chat trung tâm. Mọi id khác là id luồng việc. */
export const HUB: ConversationId = 'hub'

export type ThreadStatus = 'alert' | 'waiting' | 'running' | 'done'
export type RiskLevel = 'low' | 'mid' | 'high'
export type StepStatus = 'done' | 'running' | 'needs' | 'failed' | 'skipped'
export type RunState = 'working' | 'waiting' | 'done' | 'undone' | 'failed'

export type Thread = {
  id: ConversationId
  /** Việc + đối tượng: "Kiểm tra đơn #1042" */
  title: string
  status: ThreadStatus
  /** "21:40" */
  updatedAt: string
  /** Một câu nói luồng này làm đúng việc gì. */
  scope: string
}

export type Question = {
  id: string
  label: string
  options: string[]
  value?: string
}

export type Metric = {
  label: string
  /** Số nguyên VND, lấy từ server. */
  value: number
  unit?: 'count'
  delta?: string
  tone?: 'good' | 'bad' | 'neutral'
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'dataTable'; columns: import('@/components/flowy').DataColumn[]; rows: import('@/components/flowy').DataValue[][]; source: string; updatedAt: string; how: string }
  | { type: 'ledgerExport'; code: import('@/lib/ledgerTemplates').TemplateCode; name: string; from: string; to: string; warnings: string[] }
  | {
      /** Thay đổi dữ liệu do AI đề xuất. Chỉ ghi sau khi người dùng duyệt. */
      type: 'agentStep'
      stepId: string
      title: string
      state: RunState
      entities?: ('ledger' | 'orders' | 'alerts' | 'shop' | 'products' | 'customers' | 'todos' | 'conversations' | 'bank' | 'customer_message')[]
      requiresPassword?: boolean
      messageDraft?: { text: string; conversationId: string | null }
      steps: { label: string; meta?: string; status: StepStatus }[]
      questions?: Question[]
      approveLabel: string
      undoNote: string
      doneText?: string
    }
  | {
      type: 'resultCard'
      metrics: Metric[]
      source: string
      updatedAt: string
      how?: { label: string; value: number; total?: boolean; unit?: 'count' }[]
    }
  | {
      type: 'riskAlert'
      alertId: string
      title: string
      level: Exclude<RiskLevel, 'low'>
      reasons: string[]
      /** Chỉ hành động an toàn, đảo ngược được. */
      safeActionLabel: string
      detectedNote?: string
    }
  | {
      /** Chỉ ở chat trung tâm. Mỗi luồng một thẻ, cập nhật tại chỗ. */
      type: 'threadSummary'
      threadId: ConversationId
      title: string
      status: Exclude<ThreadStatus, 'running'>
      updatedAt: string
      summary: string
    }
  | {
      /** Chỉ ở chat trung tâm. AI tự gửi, không chờ hỏi. */
      type: 'proactiveNotice'
      noticeId: string
      threadId: ConversationId
      headline: string
      detail: string
      risk?: RiskLevel
      actionLabel: string
    }

export type Message =
  | { id: string; role: 'user'; text: string; files?: string[] }
  | { id: string; role: 'assistant'; blocks: Block[] }

export type Snapshot = {
  shopName: string
  threads: Thread[]
  conversations: Record<ConversationId, Message[]>
  /** Các hội thoại mà AI đang soạn trả lời. */
  typing: ConversationId[]
}

export type AIEvent =
  | { type: 'snapshot'; snapshot: Snapshot }
  /** Thêm mới, hoặc thay tin cũ cùng id. */
  | { type: 'message'; conversationId: ConversationId; message: Message }
  /** Thêm mới, hoặc thay luồng cũ cùng id. */
  | { type: 'thread'; thread: Thread }
  | { type: 'typing'; conversationId: ConversationId; value: boolean }

/** File đã tải lên, dùng lại id khi gửi tin. */
export type Attachment = { fileId: string; name: string }

export type SendRequest = { conversationId: ConversationId; text: string; attachments: Attachment[] }

export type AnswerRequest = { stepId: string; questionId: string; option: string }

export type ApproveResponse = { message: string }
export type AIConnection = 'connecting' | 'connected' | 'disconnected'

export interface FlowyAI {
  /** Sự kiện đầu tiên luôn là 'snapshot'. Trả về hàm hủy đăng ký. */
  subscribe(listener: (event: AIEvent) => void, onConnection?: (state: AIConnection) => void): () => void
  /** Hàm duy nhất không gửi JSON: bản thật gửi multipart. */
  upload(file: File): Promise<Attachment>
  send(request: SendRequest): Promise<void>
  answer(request: AnswerRequest): Promise<void>
  /** Trả về câu thông báo đã ghi gì, ở thì quá khứ, có số. */
  approve(stepId: string, password?: string): Promise<ApproveResponse>
  undo(stepId: string, password?: string): Promise<void>
  safeAction(alertId: string): Promise<void>
  dismissNotice(noticeId: string): Promise<void>
}
