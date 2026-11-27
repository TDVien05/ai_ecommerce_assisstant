import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { unauthorized } from '../lib/httpError.js'

export function requireAuth(req, _res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')
  if (!match) return next(unauthorized())
  try {
    const payload = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.shopId !== 'string') return next(unauthorized())
    req.auth = { userId: payload.sub, shopId: payload.shopId }
    next()
  } catch { next(unauthorized()) }
}
