import { Router } from 'express'
import * as demoController from '../controllers/demo.controller.js'

// Mounted under /api after requireAuth (see routes/index.js).
export const demoRouter = Router()

demoRouter.post('/reset', demoController.reset)
