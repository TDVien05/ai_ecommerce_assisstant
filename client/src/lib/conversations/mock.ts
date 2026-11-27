import { ApiError } from '@/lib/api'
import { localFixture } from '@/lib/mockServer/localFixture'
import type { ChatLine, Conversation, ConversationsApi } from './types'

const now = () => new Date().toISOString()
const conversations: Conversation[] = structuredClone(localFixture.conversations ?? [])
const lines: Record<string, ChatLine[]> = structuredClone(localFixture.lines ?? {})
const reply = <T>(data: T): Promise<T> => Promise.resolve(structuredClone(data))
function find(id: string) { const item = conversations.find((conversation) => conversation.id === id); if (!item) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Không tìm thấy hội thoại.'); return item }
export const mockConversations: ConversationsApi = {
  async list() { return reply({ items: conversations }) },
  async messages(id) { find(id); return reply({ items: lines[id] ?? [] }) },
  async send(id, { content }) {
    const conversation = find(id)
    if (!content.trim()) throw new ApiError(400, 'BAD_REQUEST', 'Nhập nội dung tin nhắn.')
    const message: ChatLine = { id: crypto.randomUUID(), role: 'assistant', content: content.trim(), createdAt: now() }
    ;(lines[id] ??= []).push(message); conversation.lastMessage = message.content; conversation.updatedAt = message.createdAt
    return reply({ message })
  },
  async update(id, body) { const conversation = find(id); conversation.aiPaused = body.ai_paused; return reply({ conversation }) },
}
