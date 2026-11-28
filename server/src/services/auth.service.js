import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { findByEmail, findWithShop } from '../db/users.js'
import { pool } from '../db/pool.js'
import { HttpError, unauthorized } from '../lib/httpError.js'
import { createDemoShop, findTemplate } from './demo.service.js'

const dummyHash = bcrypt.hashSync('not-a-user-password', 10)
// Demo copies sign their own JWT; the stored hash is never used to log in.
const demoShopPasswordHash = bcrypt.hashSync(crypto.randomUUID(), 10)
const demoEmail = () => env.DEMO_EMAIL?.trim().toLowerCase() || null
export async function login(email, password) {
  const user = await findByEmail(email)
  const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash)
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')
  return jwt.sign({ shopId: user.shop_id }, env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: '12h' })
}

/**
 * Every "Try a demo account" click gets its own copy of the template shop, so simultaneous
 * judges never edit each other's rows. Falls back to the shared demo login when the seed
 * (and therefore the template) has not run yet.
 */
export async function loginDemo() {
  if (!demoEmail() || !env.DEMO_PASSWORD) throw new HttpError(503, 'DEMO_UNAVAILABLE', 'Tài khoản demo chưa sẵn sàng.')
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
  const user = await findWithShop(userId)
  if (!user || user.shop_id !== shopId) throw unauthorized('Phiên đăng nhập không hợp lệ.')
  return {
    user: { id: user.id, email: user.email, ownerName: user.owner_name },
    shop: { id: user.shop_id, name: user.shop_name, isDemo: Boolean(user.is_demo) },
  }
}

export async function register({ ownerName, shopName, email, password }) {
  // The demo account is reserved, even before the seed has created it.
  if (email === demoEmail()) throw new HttpError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký.')
  const hash = await bcrypt.hash(password, 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const shop = await client.query('INSERT INTO shops (name) VALUES ($1) RETURNING id', [shopName])
    const user = await client.query('INSERT INTO users (shop_id, email, password_hash, owner_name) VALUES ($1, $2, $3, $4) RETURNING id', [shop.rows[0].id, email, hash, ownerName])
    await client.query('COMMIT')
    return jwt.sign({ shopId: shop.rows[0].id }, env.JWT_SECRET, { subject: user.rows[0].id, algorithm: 'HS256', expiresIn: '12h' })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === 'users_email_key') throw new HttpError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký.')
    throw error
  } finally { client.release() }
}
