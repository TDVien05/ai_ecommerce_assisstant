import { Router } from 'express'

// Dashboard REST API, mounted at /api. See docs/API.md section 3.
// Add feature routers here as milestones land: auth, products, orders, conversations, payments, finance.
// Each router only wires path + middleware to a handler in controllers/<name>.controller.js.
export const apiRouter = Router()
