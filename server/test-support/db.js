// Shared helpers for DB-backed tests. Every test skips itself when PostgreSQL is unreachable,
// so `npm test` still runs the pure unit tests on a machine without a database.
// Lives outside test/ on purpose: the runner treats every file under test/ as a test file.
import { pool } from '../src/db/pool.js'

export async function dbAvailable() {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

export async function createShop(name = `test-shop-${Date.now()}`, extra = {}) {
  const columns = Object.keys(extra)
  const values = Object.values(extra)
  const placeholders = values.map((_, i) => `$${i + 2}`)
  const { rows } = await pool.query(
    `INSERT INTO shops (name${columns.length ? `, ${columns.join(', ')}` : ''})
     VALUES ($1${placeholders.length ? `, ${placeholders.join(', ')}` : ''}) RETURNING *`,
    [name, ...values],
  )
  return rows[0]
}

export async function createAgentRun(shopId, command = 'test run') {
  const { rows } = await pool.query(
    'INSERT INTO agent_runs (shop_id, command) VALUES ($1, $2) RETURNING *',
    [shopId, command],
  )
  return rows[0]
}

export async function dropShops(...shopIds) {
  await pool.query('DELETE FROM shops WHERE id = ANY($1::uuid[])', [shopIds.flat()])
}

export async function createUser(shopId, email) {
  const { rows } = await pool.query(
    `INSERT INTO users (shop_id, email, password_hash) VALUES ($1, $2, 'x') RETURNING *`,
    [shopId, email],
  )
  return rows[0]
}

export { pool }
