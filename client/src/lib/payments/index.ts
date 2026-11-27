import { MockPaymentsApi } from './mock'
import type { PaymentsApi } from './types'

export * from './types'

/**
 * Chỗ duy nhất chọn nguồn dữ liệu giao dịch. Khi server có API, thay bằng bản gọi
 * api.get('/payments') và api.post(`/payments/${id}/assign`, body).
 */
export const paymentsApi: PaymentsApi = new MockPaymentsApi()
