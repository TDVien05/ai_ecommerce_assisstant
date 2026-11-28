import { Router } from 'express'
import { authRouter } from './auth.js'
import { demoRouter } from './demo.js'
import { devRouter } from './dev.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { assistantRouter } from './assistant.js'
import { financeRouter } from './finance.js'
import { ordersRouter } from './orders.js'
import { alertsRouter } from './alerts.js'

// Dashboard REST API, mounted at /api. See docs/API.md section 3.
// Add feature routers here as milestones land: auth, products, orders, conversations, payments, finance.
// Each router only wires path + middleware to a handler in controllers/<name>.controller.js.
export const apiRouter = Router()
apiRouter.use('/auth', authRouter)
apiRouter.use(requireAuth)

// Everything below requires the shop owner's JWT; req.auth = { userId, shopId }.
apiRouter.use('/dev', devRouter)
apiRouter.use('/demo', demoRouter)
apiRouter.use('/assistant', assistantRouter)
apiRouter.use('/finance', financeRouter)
apiRouter.use('/orders', ordersRouter)
apiRouter.use('/alerts', alertsRouter)
