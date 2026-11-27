import { pool } from './pool.js'

export async function findByEmail(email) {
  const { rows } = await pool.query('SELECT id, shop_id, email, password_hash FROM users WHERE email = $1', [email])
  return rows[0] ?? null
}
export async function findWithShop(id) {
  const { rows } = await pool.query('SELECT users.id, users.email, users.owner_name, shops.id AS shop_id, shops.name AS shop_name FROM users JOIN shops ON shops.id = users.shop_id WHERE users.id = $1', [id])
  return rows[0] ?? null
}
