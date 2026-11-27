import { Router } from 'express'
import { z } from 'zod'
import { loginLimiter } from '../middlewares/loginLimiter.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { login } from '../services/auth.service.js'
import { findWithShop } from '../db/users.js'
import { badRequest, unauthorized } from '../lib/httpError.js'

export const authRouter = Router()
const credentials = z.object({ email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()), password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72) })
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
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await findWithShop(req.auth.userId)
  if (!user || user.shop_id !== req.auth.shopId) throw unauthorized('Phiên đăng nhập không hợp lệ.')
  res.json({ user: { id: user.id, email: user.email }, shop: { id: user.shop_id, name: user.shop_name } })
})
