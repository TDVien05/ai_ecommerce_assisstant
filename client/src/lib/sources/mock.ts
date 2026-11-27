import type { Source, SourcesApi } from './types'
const sources: Source[] = [{ id: 'messenger', status: 'NOT_CONNECTED', detail: 'Chưa kết nối trang Facebook.', updatedAt: null }, { id: 'bank', status: 'NOT_CONNECTED', detail: 'Chưa kết nối ngân hàng.', updatedAt: null }, { id: 'statement', status: 'NOT_CONNECTED', detail: 'Chưa nhập sao kê.', updatedAt: null }]
export const mockSources: SourcesApi = { async list() { return { items: structuredClone(sources) } } }
