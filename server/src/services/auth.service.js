import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { findByEmail } from '../db/users.js'
import { HttpError } from '../lib/httpError.js'

const dummyHash = bcrypt.hashSync('not-a-user-password', 10)
export async function login(email, password) {
  const user = await findByEmail(email)
  const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash)
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
  return jwt.sign({ shopId: user.shop_id }, env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: '12h' })
}
