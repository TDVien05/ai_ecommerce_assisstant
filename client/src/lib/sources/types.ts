/**
 * Endpoint, hình dạng và mã lỗi là đề xuất cần server xác nhận.
 * Method | Path | Request | Response | Lỗi
 * GET | /api/sources | — | { items: Source[] } | 401
 */
export type Source = { id: 'messenger' | 'bank' | 'statement'; status: 'CONNECTED' | 'NOT_CONNECTED'; detail: string | null; updatedAt: string | null }
export interface SourcesApi { list(): Promise<{ items: Source[] }> }
