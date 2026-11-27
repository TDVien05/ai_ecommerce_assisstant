import { api, ApiError } from '@/lib/api'
import { readSse } from './sse'
import type { AIEvent, AnswerRequest, ApproveResponse, Attachment, FlowyAI, SendRequest } from './types'

const delays = [1000, 2000, 5000, 10000]
export class HttpFlowyAI implements FlowyAI {
  subscribe(listener: (event: AIEvent) => void) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    const connect = async () => {
      try {
        const stream = await api.stream('/assistant/stream', controller.signal)
        await readSse(stream, (frame) => {
          try {
            const payload: unknown = JSON.parse(frame.data)
            if (!payload || typeof payload !== 'object') return
            const value = payload as Record<string, unknown>
            const type = frame.event === 'message' && typeof value.type === 'string' ? value.type : frame.event
            if (!['snapshot', 'message', 'thread', 'typing'].includes(type)) return
            if (type === 'snapshot') attempt = 0
            listener({ ...value, type } as AIEvent)
          } catch { /* Bỏ qua khung không hợp lệ; kết nối tiếp tục. */ }
        })
      } catch (error) {
        if (controller.signal.aborted || (error instanceof ApiError && error.status === 401)) return
      }
      if (!controller.signal.aborted) {
        const delay = delays[Math.min(attempt, delays.length - 1)]
        attempt += 1; timer = setTimeout(connect, delay)
      }
    }
    void connect()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }
  upload(file: File): Promise<Attachment> { return api.upload('/assistant/files', file) }
  send(request: SendRequest): Promise<void> { return api.post('/assistant/messages', request) }
  answer({ stepId, questionId, option }: AnswerRequest): Promise<void> { return api.post(`/assistant/steps/${encodeURIComponent(stepId)}/answers`, { questionId, option }) }
  approve(stepId: string): Promise<ApproveResponse> { return api.post(`/assistant/steps/${encodeURIComponent(stepId)}/approve`) }
  undo(stepId: string): Promise<void> { return api.post(`/assistant/steps/${encodeURIComponent(stepId)}/undo`) }
  safeAction(alertId: string): Promise<void> { return api.post(`/assistant/alerts/${encodeURIComponent(alertId)}/safe-action`) }
  dismissNotice(noticeId: string): Promise<void> { return api.post(`/assistant/notices/${encodeURIComponent(noticeId)}/dismiss`) }
}
