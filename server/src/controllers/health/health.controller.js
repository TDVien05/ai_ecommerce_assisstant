import * as healthService from '../../services/health/health.service.js'
import { aiStatus } from '../../services/ai/index.js'

// GET /health — liveness + DB connectivity. Returns 503 when the DB is unreachable.
// features.ai: 'live' (real provider), 'mock' (AI_MOCK=true) or 'rules' (no provider, rule mode).
export const check = async (_req, res) => {
  const dbUp = await healthService.isDbUp()
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'ok' : 'down',
    features: { ai: aiStatus() },
  })
}
