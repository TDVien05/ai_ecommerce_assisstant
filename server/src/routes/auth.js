import { Router } from 'express'
import { z } from 'zod'
import { loginLimiter } from '../middlewares/loginLimiter.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { login, register } from '../services/auth.service.js'
import { env } from '../config/env.js'
import { findWithShop } from '../db/users.js'
import { badRequest, unauthorized, HttpError } from '../lib/httpError.js'

export const authRouter = Router()
const credentials = z.object({ email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()), password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72) })
const registration = credentials.extend({ ownerName: z.string().trim().min(1).max(120), shopName: z.string().trim().min(1).max(120), password: z.string().min(8).refine((value) => Buffer.byteLength(value, 'utf8') <= 72), acceptedTerms: z.literal(true) })
const attempts = new Map()
function publicLimiter(req, _res, next) {
  const now = Date.now()
  for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key)
  const key = `${req.path}:${req.ip}`
  const item = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 }
  if (item.count >= 10) return next(new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'))
  item.count += 1
  attempts.set(key, item)
  next()
}
function validateCredentials(req, _res, next) {
  const parsed = credentials.safeParse(req.body)
  if (!parsed.success) return next(badRequest('Vui lòng nhập email hợp lệ và mật khẩu không quá 72 byte.'))
  req.body = parsed.data
  next()
}
authRouter.post('/login', validateCredentials, loginLimiter, async (req, res, next) => {
  try {
    const token = await login(req.body.email, req.body.password)
    req.loginSucceeded()
    res.json({ token })
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') req.loginFailed()
    next(error)
  }
})
authRouter.post('/register', publicLimiter, async (req, res) => {
  const parsed = registration.safeParse(req.body)
  if (!parsed.success) throw badRequest('Vui lòng kiểm tra thông tin, đồng ý điều khoản và dùng mật khẩu từ 8 ký tự, tối đa 72 byte.')
  if (env.DEMO_EMAIL && parsed.data.email === env.DEMO_EMAIL.trim().toLowerCase()) throw new HttpError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký.')
  const token = await register(parsed.data)
  res.status(201).json({ token })
})
authRouter.post('/demo', publicLimiter, async (_req, res) => {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) throw new HttpError(503, 'DEMO_UNAVAILABLE', 'Tài khoản demo chưa sẵn sàng.')
  const token = await login(env.DEMO_EMAIL.trim().toLowerCase(), env.DEMO_PASSWORD)
  res.json({ token })
})
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await findWithShop(req.auth.userId)
  if (!user || user.shop_id !== req.auth.shopId) throw unauthorized('Phiên đăng nhập không hợp lệ.')
  res.json({ user: { id: user.id, email: user.email, ownerName: user.owner_name }, shop: { id: user.shop_id, name: user.shop_name, isDemo: Boolean(env.DEMO_EMAIL && user.email === env.DEMO_EMAIL.trim().toLowerCase()) } })
})
