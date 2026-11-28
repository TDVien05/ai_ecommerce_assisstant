import { Router } from 'express'
import * as controller from '../../controllers/shop/shop.controller.js'
import * as validator from '../../validators/shop/shop.validator.js'

// Payment credentials of the caller's shop. Mounted under /api/shop after requireAuth.
export const shopRouter = Router()

shopRouter.get('/payment', controller.getPaymentConfig)
shopRouter.put('/payment', validator.setPaymentSecret, controller.setPaymentSecret)
shopRouter.delete('/payment', controller.clearPaymentSecret)
