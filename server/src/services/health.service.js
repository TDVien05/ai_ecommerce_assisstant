import { pool } from '../db/pool.js'

/** Returns true when PostgreSQL answers a trivial query. */
export async function isDbUp() {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
