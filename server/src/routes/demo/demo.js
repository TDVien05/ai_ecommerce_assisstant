import { Router } from 'express'
import * as demoController from '../../controllers/demo/demo.controller.js'

// Mounted under /api after requireAuth (see app.js).
export const demoRouter = Router()

demoRouter.post('/reset', demoController.reset)
