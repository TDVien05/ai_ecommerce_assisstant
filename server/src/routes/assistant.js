import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middlewares/validate.js'
import * as controller from '../controllers/assistant.controller.js'

const attachment = z.object({ fileId: z.string().uuid(), name: z.string().min(1).max(255) }).strict()
const message = z.object({
  conversationId: z.string().trim().min(1).max(200),
  text: z.string().max(10000),
  attachments: z.array(attachment).max(10),
}).strict().refine((value) => value.text.trim().length > 0 || value.attachments.length > 0)

export const assistantRouter = Router()
assistantRouter.get('/stream', controller.stream)
assistantRouter.post('/messages', validate(message, 'body', 'Tin nhắn không hợp lệ.'), controller.send)
