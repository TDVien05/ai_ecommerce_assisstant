import { appError, toAppError, databaseCode } from '../errors/index.js'
import { logger } from '../lib/logger.js'

export const notFoundHandler = (req, res) => {
  const error = appError('NOT_FOUND', `Route ${req.method} ${req.path} not found`)
  res.status(error.status).json({ error: { code: error.code, message: error.message } })
}

// Express 5 forwards errors thrown in async handlers here automatically.
// Every error leaves in one shape (docs/API.md): { error: { code, message, details? } }.
// What maps to which status lives in errors/ (docs/ARCHITECTURE.md, section "Errors").
export const errorHandler = (err, _req, res, _next) => {
  const error = toAppError(err)

  if (error.status >= 500) {
    // Log every server-side failure once, in full (the logger drops TypeORM query parameters).
    logger.error({ err, code: error.code }, 'Request failed')
  } else if (error !== err && databaseCode(err)) {
    // A database error answered with a 4xx: log only the codes, never the values in its detail.
    const pg = err.driverError ?? err
    logger.warn({ code: error.code, pgCode: pg.code, constraint: pg.constraint }, 'Database rejected the request')
  }

  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  })
}
