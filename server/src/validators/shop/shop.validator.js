import { z } from 'zod'
import { validate } from '../validate.js'

export const setPaymentSecret = validate(
  z.object({
    secret: z.string().trim().min(16).max(256),
    provider: z.enum(['sepay']).default('sepay'),
  }).strict(),
  'body',
  'Webhook secret không hợp lệ.',
)
