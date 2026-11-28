import { Router } from 'express'
import * as validator from '../../validators/dev/dev.validator.js'
import * as devController from '../../controllers/dev/dev.controller.js'

// Dev-only helpers. Mounted under /api after requireAuth (see app.js).
export const devRouter = Router()

devRouter.post('/simulate-payment', validator.simulatePayment, devController.simulatePayment)
