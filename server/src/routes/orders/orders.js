import { Router } from 'express'
import * as validator from '../../validators/orders/orders.validator.js'
import * as controller from '../../controllers/orders/orders.controller.js'

export const ordersRouter = Router()
ordersRouter.get('/', validator.list, controller.list)
ordersRouter.get('/:id', validator.orderId, controller.get)
// Payment instructions (code + QR + deadline) must be declared before any generic /:id route
// that would otherwise swallow it.
ordersRouter.get('/:id/payment', validator.orderId, controller.payment)
ordersRouter.patch('/:id/status', validator.orderId, validator.updateStatus, controller.update)
