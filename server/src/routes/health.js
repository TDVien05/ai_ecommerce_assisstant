import { Router } from 'express'
import { pool } from '../db/pool.js'

export const healthRouter = Router()

// GET /health — liveness + DB connectivity. Returns 503 when the DB is unreachable.
healthRouter.get('/', async (_req, res) => {
  let db = 'ok'
  try {
    await pool.query('SELECT 1')
  } catch {
    db = 'down'
  }
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db })
})
