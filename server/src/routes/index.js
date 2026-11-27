import { Router } from 'express'
import { authRouter } from './auth.js'
import { requireAuth } from '../middlewares/requireAuth.js'

// Dashboard REST API, mounted at /api. See docs/API.md section 3.
// Add feature routers here as milestones land: auth, products, orders, conversations, payments, finance.
export const apiRouter = Router()
apiRouter.use('/auth', authRouter)
apiRouter.use(requireAuth)
