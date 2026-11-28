import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middlewares/validate.js'
import * as controller from '../../controllers/assistant/assistant.controller.js'
import { assistantUpload } from '../../middlewares/assistantUpload.js'
import * as alertController from '../../controllers/alerts/alerts.controller.js'

const attachment = z.object({ fileId: z.string().uuid(), name: z.string().min(1).max(255) }).strict()
const message = z.object({
  conversationId: z.string().trim().min(1).max(200),
  text: z.string().max(10000),
  attachments: z.array(attachment).max(10),
}).strict().refine((value) => value.text.trim().length > 0 || value.attachments.length > 0)

export const assistantRouter = Router()
assistantRouter.get('/stream', controller.stream)
assistantRouter.post('/files', assistantUpload, controller.upload)
assistantRouter.post('/messages', validate(message, 'body', 'Tin nhắn không hợp lệ.'), controller.send)
assistantRouter.post('/steps/:id/answers', validate(z.object({ questionId: z.string().min(1).max(100), option: z.string().min(1).max(100) }).strict()), controller.answer)
assistantRouter.post('/steps/:id/approve', controller.approve)
assistantRouter.post('/steps/:id/undo', controller.undo)

const alertId = validate(z.object({id:z.string().uuid()}).strict(), 'params', 'Mã cảnh báo không hợp lệ.')
assistantRouter.post('/alerts/:id/safe-action', alertId, alertController.safeAction)
assistantRouter.post('/notices/:id/dismiss', alertId, alertController.dismissNotice)
