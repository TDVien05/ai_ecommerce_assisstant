import { ApiError } from '@/lib/api'
import type { ChatLine, Conversation, ConversationsApi } from './types'

const now = () => new Date().toISOString()
const conversations: Conversation[] = [{ id: 'c1', customerName: 'Khách mẫu Lan', aiPaused: false, lastMessage: 'Cửa hàng còn mẫu này không?', updatedAt: now() }, { id: 'c2', customerName: 'Khách mẫu Minh', aiPaused: true, lastMessage: 'Cảm ơn cửa hàng.', updatedAt: now() }]
const lines: Record<string, ChatLine[]> = {
  c1: [{ id: 'm1', role: 'user', content: 'Cửa hàng còn mẫu này không?', createdAt: now() }],
  c2: [{ id: 'm2', role: 'user', content: 'Cảm ơn cửa hàng.', createdAt: now() }],
}
const reply = <T>(data: T): Promise<T> => Promise.resolve(structuredClone(data))
function find(id: string) { const item = conversations.find((conversation) => conversation.id === id); if (!item) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Không tìm thấy hội thoại.'); return item }
export const mockConversations: ConversationsApi = {
  async list() { return reply({ items: conversations }) },
  async messages(id) { find(id); return reply({ items: lines[id] }) },
  async send(id, { content }) {
    const conversation = find(id)
    if (!content.trim()) throw new ApiError(400, 'BAD_REQUEST', 'Nhập nội dung tin nhắn.')
    const message: ChatLine = { id: crypto.randomUUID(), role: 'assistant', content: content.trim(), createdAt: now() }
    lines[id].push(message); conversation.lastMessage = message.content; conversation.updatedAt = message.createdAt
    return reply({ message })
  },
  async update(id, body) { const conversation = find(id); conversation.aiPaused = body.ai_paused; return reply({ conversation }) },
}
