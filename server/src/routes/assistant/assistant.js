import { Router } from 'express'
import * as validator from '../../validators/assistant/assistant.validator.js'
import * as alertValidator from '../../validators/alerts/alerts.validator.js'
import * as controller from '../../controllers/assistant/assistant.controller.js'
import * as alertController from '../../controllers/alerts/alerts.controller.js'
import { assistantUpload } from '../../middlewares/assistantUpload.js'

export const assistantRouter = Router()
assistantRouter.get('/stream', controller.stream)
assistantRouter.post('/files', assistantUpload, controller.upload)
assistantRouter.post('/messages', validator.send, controller.send)
assistantRouter.post('/steps/:id/answers', validator.answer, controller.answer)
assistantRouter.get('/message-recipients', controller.messageRecipients)
assistantRouter.post('/steps/:id/message-draft', validator.messageDraft, controller.updateMessageDraft)
assistantRouter.get('/steps/:id/sensitive', controller.sensitiveDetails)
assistantRouter.post('/steps/:id/approve', validator.approval, controller.approve)
assistantRouter.post('/steps/:id/undo', validator.approval, controller.undo)

assistantRouter.post('/alerts/:id/safe-action', alertValidator.alertId, alertController.safeAction)
assistantRouter.post('/notices/:id/dismiss', alertValidator.alertId, alertController.dismissNotice)
assistantRouter.post('/proactive/refresh', controller.refreshProactive)
assistantRouter.post('/proactive/:id/dismiss', alertValidator.alertId, controller.dismissProactiveNotice)
