import * as healthService from '../services/health.service.js'

// GET /health — liveness + DB connectivity. Returns 503 when the DB is unreachable.
export const check = async (_req, res) => {
  const dbUp = await healthService.isDbUp()
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'ok' : 'down' })
}
