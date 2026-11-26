import { HttpError } from '../lib/httpError.js'
import { logger } from '../lib/logger.js'

export const notFoundHandler = (req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } })
}

// Express 5 forwards errors thrown in async handlers here automatically.
// Response shape (docs/API.md): { error: { code, message } }
export const errorHandler = (err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } })
  }

  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500

  // Unexpected errors: log details, hide them from the client. Intentional HttpErrors are exposed.
  if (status >= 500 && !(err instanceof HttpError)) {
    logger.error({ err }, 'Unhandled error')
    return res.status(status).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }

  res.status(status).json({
    error: {
      code: err.code ?? 'ERROR',
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  })
}
