import { Router } from 'express'
import { z } from 'zod'
import * as authController from '../../controllers/auth/auth.controller.js'
import { loginLimiter } from '../../middlewares/loginLimiter.js'
import { publicLimiter } from '../../middlewares/publicLimiter.js'
import { requireAuth } from '../../middlewares/requireAuth.js'
import { validate } from '../../middlewares/validate.js'

export const authRouter = Router()

// bcrypt only uses the first 72 bytes of a password.
const maxBcryptBytes = (value) => Buffer.byteLength(value, 'utf8') <= 72
const credentials = z.object({
  email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(1).refine(maxBcryptBytes),
})
const registration = credentials.extend({
  ownerName: z.string().trim().min(1).max(120),
  shopName: z.string().trim().min(1).max(120),
  password: z.string().min(8).refine(maxBcryptBytes),
  acceptedTerms: z.literal(true),
})

// Validation runs before loginLimiter so the limiter keys on the normalized email.
authRouter.post(
  '/login',
  validate(credentials, 'body', 'Vui lòng nhập email hợp lệ và mật khẩu không quá 72 byte.'),
  loginLimiter,
  authController.login,
)
authRouter.post(
  '/register',
  publicLimiter,
  validate(registration, 'body', 'Vui lòng kiểm tra thông tin, đồng ý điều khoản và dùng mật khẩu từ 8 ký tự, tối đa 72 byte.'),
  authController.register,
)
authRouter.post('/demo', publicLimiter, authController.demo)
authRouter.get('/me', requireAuth, authController.me)
