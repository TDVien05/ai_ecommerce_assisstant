// Input of the /api/dev routes. See docs/ARCHITECTURE.md, section "Validators".
import { z } from 'zod'
import { validate } from '../validate.js'

export const simulatePayment = validate(z.object({ orderId: z.string().uuid() }), 'body', 'Cần orderId hợp lệ.')
