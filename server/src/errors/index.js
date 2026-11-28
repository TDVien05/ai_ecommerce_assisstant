// Errors for the whole server. Throw by code; the status comes from the catalog in codes.js.
// See docs/ARCHITECTURE.md, section "Errors".
import { AppError } from './AppError.js'
import { ERROR_CODES } from './codes.js'

export { AppError, HttpError } from './AppError.js'
export { ERROR_CODES } from './codes.js'
export { toAppError, databaseCode } from './normalize.js'

/**
 * appError('STEP_CONFLICT', 'Bước đã thay đổi.') -> AppError with the catalog's status.
 * Without a message the catalog's default is used. `status` only for a code with two legitimate
 * statuses (INVALID_FILE: 413 when the file is too large).
 */
export function appError(code, message, { details, status } = {}) {
  const entry = ERROR_CODES[code]
  if (!entry) throw new Error(`Unknown error code ${code}: add it to errors/codes.js`)
  return new AppError(status ?? entry.status, code, message ?? entry.message, details)
}

export const badRequest = (message, details) => appError('BAD_REQUEST', message, { details })
export const unauthorized = (message) => appError('UNAUTHORIZED', message)
export const forbidden = (message) => appError('FORBIDDEN', message)
export const notFound = (message) => appError('NOT_FOUND', message)
