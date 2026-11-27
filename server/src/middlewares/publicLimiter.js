import { HttpError } from '../lib/httpError.js'

// Simple per-IP limiter for public auth endpoints (register, demo): 10 requests / 15 minutes per path.
const windowMs = 15 * 60 * 1000
const limit = 10
const attempts = new Map()

export function publicLimiter(req, _res, next) {
  const now = Date.now()
  for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key)
  const key = `${req.path}:${req.ip}`
  const item = attempts.get(key) ?? { count: 0, until: now + windowMs }
  if (item.count >= limit) return next(new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'))
  item.count += 1
  attempts.set(key, item)
  next()
}
