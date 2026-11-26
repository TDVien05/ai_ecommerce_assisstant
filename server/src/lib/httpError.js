/** Error carrying an HTTP status and a stable machine-readable code. Rendered by errorHandler. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message = 'Bad request', details) =>
  new HttpError(400, 'BAD_REQUEST', message, details)
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message)
