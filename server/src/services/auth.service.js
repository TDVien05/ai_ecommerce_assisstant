import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { findByEmail } from '../db/users.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../lib/httpError.js'

const dummyHash = bcrypt.hashSync('not-a-user-password', 10)
export async function login(email, password) {
  const user = await findByEmail(email)
  const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash)
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')
  return jwt.sign({ shopId: user.shop_id }, env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: '12h' })
}

export async function register({ ownerName, shopName, email, password }) {
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
