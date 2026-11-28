import { api } from '@/lib/api'
import type { AlertsApi } from './types'
export const httpAlerts: AlertsApi = {
  list: (query = {}) => api.get('/alerts',query),
  hold: (id) => api.post(`/alerts/${encodeURIComponent(id)}/hold`),
  dismiss: (id) => api.post(`/alerts/${encodeURIComponent(id)}/dismiss`),
}
