/**
 * Method | Path | Request | Response | Lỗi
 * GET | /api/conversations | — | { items: Conversation[] } | 401
 * GET | /api/conversations/:id/messages | — | { items: ChatLine[] } | 401, 404
 * POST | /api/conversations/:id/messages | { content } | { message: ChatLine } | 400, 401, 404
 * PATCH | /api/conversations/:id | { ai_paused } | { conversation } | 400, 401, 404
 * Hình dạng response và mã lỗi là đề xuất cần server xác nhận.
 */
export type Conversation = { id: string; customerName: string; aiPaused: boolean; lastMessage: string | null; updatedAt: string }
export type ChatLine = { id: string; role: 'user' | 'assistant' | 'tool'; content: string; createdAt: string }
export interface ConversationsApi {
  list(): Promise<{ items: Conversation[] }>
  messages(id: string): Promise<{ items: ChatLine[] }>
  send(id: string, body: { content: string }): Promise<{ message: ChatLine }>
  update(id: string, body: { ai_paused: boolean }): Promise<{ conversation: Conversation }>
}
