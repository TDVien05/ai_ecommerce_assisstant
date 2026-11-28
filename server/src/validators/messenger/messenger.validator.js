import { z } from 'zod'
import { validate } from '../validate.js'

/** Route input for the messenger feature. Schemas live here, not in routers. */
export const conversationId = validate(
  z.object({ id: z.string().uuid() }).strict(),
  'params',
  'Mã hội thoại không hợp lệ.',
)

export const pauseBody = validate(
  z.object({ aiPaused: z.boolean() }).strict(),
  'body',
  'Trạng thái trợ lý không hợp lệ.',
)
