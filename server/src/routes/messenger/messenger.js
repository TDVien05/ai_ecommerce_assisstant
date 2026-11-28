import { Router } from 'express'
import * as controller from '../../controllers/messenger/messenger.controller.js'
import * as validator from '../../validators/messenger/messenger.validator.js'

// Bot control per conversation. Mounted under /api/messenger after requireAuth.
export const messengerRouter = Router()

messengerRouter.patch(
  '/conversations/:id',
  validator.conversationId,
  validator.pauseBody,
  controller.setPaused,
)
