import bcrypt from 'bcrypt'
import { env } from '../config/env.js'
import { pool } from './pool.js'

async function seed() {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) { console.log('Demo seed skipped: DEMO_EMAIL or DEMO_PASSWORD missing'); return }
  if (Buffer.byteLength(env.DEMO_PASSWORD, 'utf8') > 72) throw new Error('DEMO_PASSWORD exceeds 72 bytes')
  const email = env.DEMO_EMAIL.trim().toLowerCase()
  const hash = await bcrypt.hash(env.DEMO_PASSWORD, 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length) await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, existing.rows[0].id])
    else {
      const shop = await client.query('INSERT INTO shops (name) VALUES ($1) RETURNING id', ['Cửa hàng demo'])
      await client.query('INSERT INTO users (shop_id, email, password_hash) VALUES ($1, $2, $3)', [shop.rows[0].id, email, hash])
    }
    await client.query('COMMIT')
    console.log('Demo account seeded')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
seed().catch((error) => { console.error('Demo seed failed:', error.message); process.exitCode = 1 }).finally(() => pool.end())
