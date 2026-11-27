import { ApiError } from '@/lib/api'
import { respond, store } from '@/lib/mockServer/store'
import type { Alert, AlertsApi } from './types'

function find(id: string): Alert {
  const alert = store.alerts.find((item) => item.id === id)
  if (!alert) throw new ApiError(404, 'ALERT_NOT_FOUND', 'Không tìm thấy cảnh báo.')
  return alert
}
export const mockAlerts: AlertsApi = {
  async list(query = {}) { return respond({ items: store.alerts.filter((alert) => !query.status || alert.status === query.status) }) },
  async hold(id) {
    const alert = find(id)
    if (alert.status !== 'OPEN') throw new ApiError(409, 'ALERT_CLOSED', 'Cảnh báo đã được xử lý.')
    if (alert.orderId) store.heldOrders.add(alert.orderId)
    alert.status = 'HELD'
    return respond({ alert })
  },
  async dismiss(id) {
    const alert = find(id)
    if (alert.status !== 'OPEN') throw new ApiError(409, 'ALERT_CLOSED', 'Cảnh báo đã được xử lý.')
    alert.status = 'DISMISSED'
    return respond({ alert })
  },
}
