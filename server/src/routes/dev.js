import { Router } from 'express'
import { z } from 'zod'
import * as devController from '../controllers/dev.controller.js'
import { validate } from '../middlewares/validate.js'

// Dev-only helpers. Mounted under /api after requireAuth (see routes/index.js).
export const devRouter = Router()

devRouter.post(
  '/simulate-payment',
  validate(z.object({ orderId: z.string().uuid() }), 'body', 'Cần orderId hợp lệ.'),
  devController.simulatePayment,
)
