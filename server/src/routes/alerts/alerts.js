import { Router } from 'express'
import * as validator from '../../validators/alerts/alerts.validator.js'
import * as controller from '../../controllers/alerts/alerts.controller.js'

export const alertsRouter = Router()
alertsRouter.get('/', validator.list, controller.list)
alertsRouter.post('/:id/hold', validator.alertId, controller.hold)
alertsRouter.post('/:id/dismiss', validator.alertId, controller.dismiss)
