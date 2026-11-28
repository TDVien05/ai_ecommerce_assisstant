import { Router } from 'express'
import * as validator from '../../validators/auth/auth.validator.js'
import * as authController from '../../controllers/auth/auth.controller.js'
import { loginLimiter } from '../../middlewares/loginLimiter.js'
import { publicLimiter } from '../../middlewares/publicLimiter.js'
import { requireAuth } from '../../middlewares/requireAuth.js'

export const authRouter = Router()

// The validator runs before loginLimiter so the limiter keys on the normalized email.
authRouter.post('/login', validator.login, loginLimiter, authController.login)
authRouter.post('/register', publicLimiter, validator.register, authController.register)
authRouter.post('/demo', publicLimiter, authController.demo)
authRouter.get('/me', requireAuth, authController.me)
