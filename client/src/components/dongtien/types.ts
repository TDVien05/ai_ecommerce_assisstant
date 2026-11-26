/** Trạng thái một luồng việc (thread). Xem docs/design-system/README.md#luồng-việc */
export type ThreadStatus = 'alert' | 'waiting' | 'running' | 'done'

/** Ba mức rủi ro lừa đảo theo SRS: Thấp, Trung bình, Cao. */
export type RiskLevel = 'low' | 'mid' | 'high'

export type StepStatus = 'done' | 'running' | 'needs' | 'failed' | 'skipped'

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  alert: 'Có cảnh báo',
  waiting: 'Chờ bạn duyệt',
  running: 'Đang chạy',
  done: 'Đã xong',
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Rủi ro thấp',
  mid: 'Rủi ro trung bình',
  high: 'Rủi ro cao',
}
