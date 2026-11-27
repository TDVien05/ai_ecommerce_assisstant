/**
 * Các endpoint và mã lỗi dưới đây là đề xuất cần server xác nhận.
 * Method | Path | Request | Response | Lỗi
 * GET | /api/alerts | status? | { items: Alert[] } | 400, 401
 * POST | /api/alerts/:id/hold | — | { alert: Alert } | 401, 404, 409
 * POST | /api/alerts/:id/dismiss | — | { alert: Alert } | 401, 404, 409
 */
export type AlertStatus = 'OPEN' | 'HELD' | 'DISMISSED'
export type Alert = { id: string; level: 'mid' | 'high'; title: string; reasons: string[]; orderId: string | null; orderCode: string | null; detectedAt: string; status: AlertStatus }
export interface AlertsApi {
  list(query?: { status?: AlertStatus }): Promise<{ items: Alert[] }>
  hold(id: string): Promise<{ alert: Alert }>
  dismiss(id: string): Promise<{ alert: Alert }>
}
