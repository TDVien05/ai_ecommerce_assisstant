import { api } from '@/lib/api'

/**
 * Cấu hình thanh toán của cửa hàng (mô hình nhiều shop: mỗi shop một cổng riêng).
 * Secret KHÔNG bao giờ trả về plaintext — chỉ cờ hasSecret và 4 ký tự cuối.
 */
export type PaymentConfig = {
  provider: string | null
  hasSecret: boolean
  secretMask: string | null
  bankAccountNumber: string | null
  /** Đường dẫn webhook để dán vào SePay, ví dụ /webhooks/sepay/<shopId>. */
  webhookPath: string
  encryptionConfigured: boolean
}

export type SetPaymentSecretBody = { secret: string; provider?: 'sepay' }

export interface PaymentConfigApi {
  get(): Promise<{ payment: PaymentConfig }>
  set(body: SetPaymentSecretBody): Promise<{ payment: PaymentConfig }>
  clear(): Promise<{ payment: PaymentConfig }>
}

export const paymentConfigApi: PaymentConfigApi = {
  get: () => api.get('/shop/payment'),
  set: (body) => api.put('/shop/payment', body),
  clear: () => api.delete('/shop/payment'),
}

/**
 * Hướng dẫn thanh toán của một đơn: mã chuyển khoản, hạn 30 phút và ảnh VietQR.
 * `ready = false` khi shop chưa cấu hình tài khoản nhận tiền.
 */
export type PaymentInstructions = {
  paymentCode: string
  amount: number
  expiresAt: string | null
  windowMinutes: number
  bankCode: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
  qrUrl: string | null
  transferNote: string
  ready: boolean
}

export interface PaymentInstructionsApi {
  get(orderId: string): Promise<{ payment: PaymentInstructions }>
}

export const paymentInstructionsApi: PaymentInstructionsApi = {
  get: (orderId) => api.get(`/orders/${encodeURIComponent(orderId)}/payment`),
}
