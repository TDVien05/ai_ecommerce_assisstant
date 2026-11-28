// Input of the /api/orders routes. See docs/ARCHITECTURE.md, section "Validators".
import { z } from 'zod'
import { validate } from '../validate.js'

const date = z.string().datetime({ offset: true })

export const orderId = validate(z.object({ id: z.string().uuid() }).strict(), 'params', 'Mã đơn không hợp lệ.')

export const list = validate(z.object({
  status: z.enum(['AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED']).optional(),
  from: date.optional(),
  to: date.optional(),
  overdue: z.literal('1').optional(),
  code: z.string().trim().min(1).max(100).optional(),
}).strict(), 'query', 'Bộ lọc không hợp lệ.')

export const updateStatus = validate(z.object({ status: z.enum(['SHIPPING', 'COMPLETED', 'CANCELLED']) }).strict(), 'body', 'Trạng thái không hợp lệ.')
