// Input of the /api/alerts routes. See docs/ARCHITECTURE.md, section "Validators".
import { z } from 'zod'
import { validate } from '../validate.js'

/** :id of an alert; also used by the assistant's alert and notice actions. */
export const alertId = validate(z.object({ id: z.string().uuid() }).strict(), 'params', 'Mã cảnh báo không hợp lệ.')

export const list = validate(z.object({ status: z.enum(['OPEN', 'HELD', 'DISMISSED']).optional() }).strict(), 'query', 'Bộ lọc không hợp lệ.')
