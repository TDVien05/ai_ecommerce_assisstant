import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import * as userRepo from '../../repositories/auth/user.repository.js'
import { appError, unauthorized } from '../../errors/index.js'
import { createDemoShop, findTemplate } from '../demo/demo.service.js'

const dummyHash = bcrypt.hashSync('not-a-user-password', 10)
// Demo copies sign their own JWT; the stored hash is never used to log in.
const demoShopPasswordHash = bcrypt.hashSync(crypto.randomUUID(), 10)
const demoEmail = () => env.DEMO_EMAIL?.trim().toLowerCase() || null
export async function login(email, password) {
  const user = await userRepo.findByEmail(email)
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash)
  if (!user || !valid) throw appError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')
  return jwt.sign({ shopId: user.shopId }, env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: '12h' })
}

/**
 * Every "Try a demo account" click gets its own copy of the template shop, so simultaneous
 * judges never edit each other's rows. Falls back to the shared demo login when the seed
 * (and therefore the template) has not run yet.
 */
export async function loginDemo() {
  if (!demoEmail() || !env.DEMO_PASSWORD) throw appError('DEMO_UNAVAILABLE', 'Tài khoản demo chưa sẵn sàng.')
  if (await findTemplate()) {
    const demo = await createDemoShop({ passwordHash: demoShopPasswordHash })
    return jwt.sign({ shopId: demo.shopId }, env.JWT_SECRET, {
      subject: demo.userId, algorithm: 'HS256', expiresIn: '12h',
    })
  }
  return login(demoEmail(), env.DEMO_PASSWORD)
}

// Current user + shop for a verified token ({ userId, shopId } from requireAuth).
export async function getSession({ userId, shopId }) {
  const user = await userRepo.findWithShop(userId)
  if (!user || user.shopId !== shopId) throw unauthorized('Phiên đăng nhập không hợp lệ.')
  return {
    user: { id: user.id, email: user.email, ownerName: user.ownerName },
    shop: { id: user.shopId, name: user.shopName, isDemo: Boolean(user.isDemo) },
  }
}

export async function register({ ownerName, shopName, email, password }) {
  // The demo account is reserved, even before the seed has created it.
  if (email === demoEmail()) throw appError('EMAIL_EXISTS', 'Email này đã được đăng ký.')
  const hash = await bcrypt.hash(password, 10)
  try {
    // Shop and owner are created together or not at all.
    const { shopId, userId } = await userRepo.registerOwner({ shopName, email, passwordHash: hash, ownerName })
    return jwt.sign({ shopId }, env.JWT_SECRET, { subject: userId, algorithm: 'HS256', expiresIn: '12h' })
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') throw appError('EMAIL_EXISTS', 'Email này đã được đăng ký.')
    throw error
  }
}
