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
assistantRouter.post('/steps/:id/approve', controller.approve)
assistantRouter.post('/steps/:id/undo', controller.undo)

assistantRouter.post('/alerts/:id/safe-action', alertValidator.alertId, alertController.safeAction)
assistantRouter.post('/notices/:id/dismiss', alertValidator.alertId, alertController.dismissNotice)
