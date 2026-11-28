import { badRequest } from '../errors/index.js'

/**
 * Validate req[source] with a zod schema.
 *   router.post('/', validate(bodySchema), handler)          -> req.body is the parsed value
 *   router.get('/', validate(querySchema, 'query'), handler) -> parsed value on req.validatedQuery
 * (req.query is a read-only getter in Express 5, so it can't be reassigned.)
 * `message` overrides the user-facing error message (the client shows error.message).
 */
export const validate =
  (schema, source = 'body', message = 'Invalid input') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      throw badRequest(
        message,
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      )
    }
    if (source === 'query') req.validatedQuery = result.data
    else req[source] = result.data
    next()
  }
