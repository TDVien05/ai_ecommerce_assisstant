import { HttpError } from '../lib/httpError.js'

const windowMs = 15 * 60 * 1000
const attempts = new Map()
const limit = 5

export function loginLimiter(req, _res, next) {
  const now = Date.now()
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key)
  const keys = [`ip:${req.ip}`, `email:${req.body.email}`]
  if (keys.some((key) => (attempts.get(key)?.count ?? 0) >= limit)) return next(new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'))
  // Reserve the attempt before async password verification, including concurrent requests.
  const reserved = keys.map((key) => {
    const entry = attempts.get(key) ?? { count: 0, expires: now + windowMs }
    entry.count += 1
    attempts.set(key, entry)
    return [key, entry]
  })
  req.loginFailed = () => {}
  req.loginSucceeded = () => {
    for (const [key, entry] of reserved) {
      if (attempts.get(key) === entry) attempts.delete(key)
    }
  }
  next()
}
