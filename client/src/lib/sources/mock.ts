import type { Source, SourcesApi } from './types'
const sources: Source[] = [{ id: 'messenger', status: 'CONNECTED', detail: 'Trang Facebook mẫu, kết nối giả lập.', updatedAt: new Date().toISOString() }, { id: 'bank', status: 'CONNECTED', detail: 'Ngân hàng mẫu, kết nối giả lập.', updatedAt: new Date().toISOString() }, { id: 'statement', status: 'CONNECTED', detail: 'Sao kê mẫu đã nhập, dữ liệu giả lập.', updatedAt: new Date().toISOString() }]
export const mockSources: SourcesApi = { async list() { return { items: structuredClone(sources) } } }
