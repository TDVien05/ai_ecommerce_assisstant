/**
 * The one error class: an HTTP status, a stable machine-readable code from errors/codes.js,
 * a message safe to show the user, and optional details (e.g. validation issues).
 * Rendered by middlewares/errorHandler.js. Throw it through appError() in errors/index.js.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Same class under its former name, so existing `instanceof HttpError` and subclasses keep working. */
export { AppError as HttpError }
