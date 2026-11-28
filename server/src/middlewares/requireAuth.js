import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { unauthorized } from '../errors/index.js'

export function requireAuth(req, _res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')
  if (!match) return next(unauthorized('Bạn cần đăng nhập để tiếp tục.'))
  try {
    const payload = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.shopId !== 'string') return next(unauthorized('Phiên đăng nhập không hợp lệ.'))
    req.auth = { userId: payload.sub, shopId: payload.shopId }
    next()
  } catch { next(unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')) }
}
