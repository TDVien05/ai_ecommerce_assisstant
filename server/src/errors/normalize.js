// toAppError(err): turn anything that was thrown into an AppError with the right HTTP status.
// The response never carries a PostgreSQL message or detail (they can contain values such as an
// email address) or a stack trace. See docs/ARCHITECTURE.md, section "Errors".
import { AppError } from './AppError.js'
import { ERROR_CODES } from './codes.js'

const fromCatalog = (code) => new AppError(ERROR_CODES[code].status, code, ERROR_CODES[code].message)

// PostgreSQL SQLSTATE -> catalog code.
const PG_CODES = {
  23505: 'DUPLICATE',
  23503: 'INVALID_REFERENCE',
  '22P02': 'INVALID_INPUT', // invalid text representation (e.g. a malformed uuid)
  22003: 'INVALID_INPUT', // numeric value out of range
  22007: 'INVALID_INPUT', // invalid datetime format
  22008: 'INVALID_INPUT', // datetime field overflow
  23502: 'INVALID_INPUT', // not null violation
  23514: 'INVALID_INPUT', // check violation
  40001: 'DATABASE_BUSY', // serialization failure
  '40P01': 'DATABASE_BUSY', // deadlock detected
  '55P03': 'DATABASE_BUSY', // lock not available
  57014: 'DATABASE_TIMEOUT', // statement timeout / query canceled
  53300: 'DATABASE_UNAVAILABLE', // too many connections
}
const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

/** The pg error under a TypeORM QueryFailedError, or the error itself. */
const unwrap = (err) => err?.driverError ?? err

/** Catalog code for a database or connection error, or null when it is not one. */
export function databaseCode(err) {
  const error = unwrap(err)
  const code = typeof error?.code === 'string' ? error.code : null
  if (!code) return null
  if (PG_CODES[code]) return PG_CODES[code]
  if (CONNECTION_CODES.has(code) || /^08/.test(code) || /^57P0/.test(code)) return 'DATABASE_UNAVAILABLE'
  return null
}

export function toAppError(err) {
  if (err instanceof AppError) return err

  // Several errors at once (Node throws AggregateError when every database address is refused):
  // answer with the most severe one.
  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.map(toAppError).sort((a, b) => b.status - a.status)[0]
  }

  // express.json() / express.raw() errors.
  if (err?.type === 'entity.parse.failed') return fromCatalog('INVALID_JSON')
  if (err?.type === 'entity.too.large') return fromCatalog('PAYLOAD_TOO_LARGE')

  const dbCode = databaseCode(err)
  if (dbCode) return fromCatalog(dbCode)

  // Other errors that already carry a 4xx status (e.g. from an Express middleware) keep it.
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
    return new AppError(err.status, typeof err.code === 'string' ? err.code : 'BAD_REQUEST', err.message || ERROR_CODES.BAD_REQUEST.message)
  }

  return fromCatalog('INTERNAL_ERROR')
}
