import { api } from '@/lib/api'
import type { OrdersApi } from './types'

export const httpOrders: OrdersApi = {
  list: (query = {}) => api.get('/orders', query),
  get: (id) => api.get(`/orders/${encodeURIComponent(id)}`),
  updateStatus: (id, body) => api.patch(`/orders/${encodeURIComponent(id)}/status`, body),
}
