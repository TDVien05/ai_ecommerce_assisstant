// AI giả lập chạy trong trình duyệt. Không gọi mạng, tải lại trang là về dữ liệu đầu.
import { clock, initialSnapshot, ledgerStep, profitResult, say, text, today } from './mockData'
import { applyEvent } from './reduce'
import {
  HUB,
  type AIEvent,
  type AnswerRequest,
  type Block,
  type ConversationId,
  type FlowyAI,
  type Message,
  type SendRequest,
  type Snapshot,
  type Thread,
} from './types'

type StepBlock = Extract<Block, { type: 'agentStep' }>

/** Kết quả báo cáo tuần và đơn khả nghi mới tự đến sau từng này mili giây. */
const REPORT_DELAY = 6_000
const NOTICE_DELAY = 15_000
const REPLY_DELAY = 900

export class MockFlowyAI implements FlowyAI {
  private state: Snapshot = initialSnapshot()
  private listeners = new Set<(event: AIEvent) => void>()
  private started = false
  private seq = 0
  private uploads = 0

  subscribe(listener: (event: AIEvent) => void) {
    this.listeners.add(listener)
    listener({ type: 'snapshot', snapshot: structuredClone(this.state) })
    this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }

  async upload(file: File) {
    return { fileId: this.nextId('f'), name: file.name }
  }

  async send({ conversationId, text: value, attachments }: SendRequest) {
    this.post(conversationId, {
      id: this.nextId('u'),
      role: 'user',
      text: value,
      files: attachments.length ? attachments.map((a) => a.name) : undefined,
    })
    const q = value.toLowerCase()
    if (conversationId === HUB && (attachments.length > 0 || q.includes('sao kê'))) {
      if (attachments.length === 0) return this.reply(HUB, text('Bạn đính kèm file sao kê (nút kẹp giấy) rồi gửi nhé.'))
      return this.openLedgerThread()
    }
    if (q.includes('lãi') || q.includes('doanh thu')) {
      return this.reply(conversationId, text('Số tạm tính trong tuần:'), profitResult())
    }
    if (q.includes('chưa thanh toán')) {
      return this.reply(conversationId, text('Đơn #1042 đang chờ thanh toán. Ngân hàng chưa báo tiền vào.'))
    }
    return this.reply(
      conversationId,
      text('Đây là bản giả lập nên mình chưa hiểu câu này. Bạn thử "Lãi tuần này?" hoặc đính kèm file sao kê.'),
    )
  }

  async answer({ stepId, questionId, option }: AnswerRequest) {
    this.updateStep(stepId, (step) => {
      if (step.state !== 'waiting') return step
      const questions = step.questions?.map((q) => (q.id === questionId ? { ...q, value: option } : q))
      const answered = questions?.every((q) => q.value) ?? true
      const steps = step.steps.map((s, i) =>
        i === step.steps.length - 1 ? { ...s, status: answered ? ('done' as const) : ('needs' as const) } : s,
      )
      return { ...step, questions, steps }
    })
  }

  async approve(stepId: string) {
    const { step, conversationId } = this.findStep(stepId)
    if (step.state !== 'waiting') throw new Error('Việc này không còn chờ duyệt.')
    const missing = step.questions?.filter((q) => !q.value).length ?? 0
    if (missing > 0) throw new Error(`Còn ${missing} dòng cần chọn loại trước khi ghi sổ.`)
    this.updateStep(stepId, (s) => ({ ...s, state: 'done', doneText: `Đã ghi 14 giao dịch lúc ${clock()}` }))
    this.setThread(conversationId, 'done', 'Đã ghi 14 giao dịch vào sổ.')
    return { message: 'Đã ghi 14 giao dịch vào sổ.' }
  }

  async undo(stepId: string) {
    const { step, conversationId } = this.findStep(stepId)
    if (step.state !== 'done') return
    this.updateStep(stepId, (s) => ({ ...s, state: 'undone' }))
    this.setThread(conversationId, 'done', 'Đã hoàn tác. 14 giao dịch không còn trong sổ.')
  }

  async safeAction(alertId: string) {
    const conversationId = this.state.threads.find((t) =>
      this.state.conversations[t.id]?.some(
        (m) => m.role === 'assistant' && m.blocks.some((b) => b.type === 'riskAlert' && b.alertId === alertId),
      ),
    )?.id
    if (!conversationId) throw new Error('Không tìm thấy cảnh báo.')
    const id = `held-${alertId}`
    if (this.state.conversations[conversationId].some((m) => m.id === id)) return
    this.post(conversationId, say(id, text('Đơn đang được giữ, chưa giao. Chỉ giao khi ngân hàng báo tiền vào.')))
    this.setThread(conversationId, 'done', 'Đơn được giữ, chưa giao.')
  }

  async dismissNotice(noticeId: string) {
    const message = this.state.conversations[HUB].find((m) => m.id === `notice-${noticeId}`)
    const notice = message?.role === 'assistant' ? message.blocks[0] : undefined
    if (notice?.type !== 'proactiveNotice') return
    this.post(HUB, say(`notice-${noticeId}`, text(`Đã bỏ qua cảnh báo: ${notice.headline} Đơn vẫn được giữ.`)))
    const thread = this.state.threads.find((t) => t.id === notice.threadId)
    // Bỏ qua cảnh báo chỉ tắt nhắc nhở, không giao đơn và không đổi trạng thái thanh toán.
    if (thread) this.emit({ type: 'thread', thread: { ...thread, status: 'done', updatedAt: clock() } })
  }

  /** Hai việc AI tự làm khi mở app: xong báo cáo tuần, rồi phát hiện một đơn khả nghi. */
  private start() {
    if (this.started) return
    this.started = true
    setTimeout(() => {
      this.post('t-week', say('m-week-done', text('Báo cáo tuần đã xong.'), profitResult()))
      this.setThread('t-week', 'done', 'Báo cáo tuần đã xong. Mở luồng để xem số liệu và cách tính.')
    }, REPORT_DELAY)
    setTimeout(() => this.raiseSuspiciousOrder(), NOTICE_DELAY)
  }

  private raiseSuspiciousOrder() {
    const thread: Thread = {
      id: 't-1051',
      title: 'Kiểm tra đơn #1051',
      status: 'alert',
      updatedAt: clock(),
      scope: 'Luồng này chỉ kiểm tra đơn #1051. Đơn đang được giữ, chưa giao.',
    }
    const reasons = ['Khách nói đã chuyển khoản nhưng ngân hàng chưa báo tiền vào.', 'Khách hối giao hàng ngay.']
    this.emit({ type: 'thread', thread })
    this.post(
      thread.id,
      say('m-1051', {
        type: 'riskAlert',
        alertId: 'a-1051',
        title: 'Đơn #1051 cần kiểm tra',
        level: 'mid',
        reasons,
        safeActionLabel: 'Giữ đơn, chưa giao',
        detectedNote: `Phát hiện lúc ${thread.updatedAt} từ tin nhắn Messenger`,
      }),
    )
    this.post(
      HUB,
      say('notice-n-1051', {
        type: 'proactiveNotice',
        noticeId: 'n-1051',
        threadId: thread.id,
        risk: 'mid',
        headline: 'Đơn #1051 cần kiểm tra.',
        detail: `${reasons[0]} Mình đã giữ đơn lại và mở luồng kiểm tra.`,
        actionLabel: 'Mở luồng kiểm tra',
      }),
    )
  }

  private openLedgerThread() {
    const id = this.nextId('t')
    this.uploads += 1
    const title = `Ghi sổ sao kê ${today()} (file ${this.uploads})`
    const thread: Thread = {
      id,
      title,
      status: 'running',
      updatedAt: clock(),
      scope: 'Luồng này chỉ ghi sổ file sao kê vừa gửi.',
    }
    this.emit({ type: 'thread', thread })
    this.emit({ type: 'typing', conversationId: id, value: true })
    this.post(HUB, say(this.nextId('m'), text(`Mình đã mở luồng "${title}", đọc xong sẽ báo lại ở đây.`)))
    setTimeout(() => {
      this.emit({ type: 'typing', conversationId: id, value: false })
      this.post(id, say(this.nextId('m'), text('Mình đã đọc file. Còn 2 dòng cần bạn chọn.'), ledgerStep(`s-${id}`)))
      this.setThread(id, 'waiting', 'Đã đọc 14 giao dịch. Còn 2 dòng cần bạn chọn loại trước khi ghi sổ.')
    }, REPLY_DELAY * 3)
  }

  private reply(conversationId: ConversationId, ...blocks: Block[]) {
    this.emit({ type: 'typing', conversationId, value: true })
    setTimeout(() => {
      this.emit({ type: 'typing', conversationId, value: false })
      this.post(conversationId, say(this.nextId('m'), ...blocks))
    }, REPLY_DELAY)
  }

  /** Đổi trạng thái luồng và cập nhật (không thêm mới) thẻ tóm tắt ở chat trung tâm. */
  private setThread(id: ConversationId, status: 'waiting' | 'done', summary: string) {
    const current = this.state.threads.find((t) => t.id === id)
    if (!current) return
    const thread: Thread = { ...current, status, updatedAt: clock() }
    this.emit({ type: 'thread', thread })
    this.post(
      HUB,
      say(`summary-${id}`, {
        type: 'threadSummary',
        threadId: id,
        title: thread.title,
        status,
        updatedAt: thread.updatedAt,
        summary,
      }),
    )
  }

  private findStep(stepId: string) {
    for (const [conversationId, messages] of Object.entries(this.state.conversations)) {
      for (const message of messages) {
        if (message.role !== 'assistant') continue
        for (const block of message.blocks) {
          if (block.type === 'agentStep' && block.stepId === stepId) return { conversationId, message, step: block }
        }
      }
    }
    throw new Error('Không tìm thấy việc cần duyệt.')
  }

  private updateStep(stepId: string, change: (step: StepBlock) => StepBlock) {
    const { conversationId, message, step } = this.findStep(stepId)
    this.post(conversationId, { ...message, blocks: message.blocks.map((b) => (b === step ? change(step) : b)) })
  }

  private post(conversationId: ConversationId, message: Message) {
    this.emit({ type: 'message', conversationId, message })
  }

  private emit(raw: AIEvent) {
    // Ép qua JSON để mọi thứ không gửi được qua mạng lỗi ngay ở bản mock.
    const event = JSON.parse(JSON.stringify(raw)) as AIEvent
    this.state = applyEvent(this.state, event) ?? this.state
    this.listeners.forEach((listener) => listener(event))
  }

  private nextId(prefix: string) {
    this.seq += 1
    return `${prefix}-${this.seq}`
  }
}
