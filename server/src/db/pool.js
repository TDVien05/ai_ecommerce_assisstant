import pg from 'pg'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// Money is BIGINT VND in the DB and `number` in JS. pg returns int8 as string by default;
// VND amounts stay far below Number.MAX_SAFE_INTEGER, so parse them as numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL })

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'))

export const query = (text, params) => pool.query(text, params)

/**
 * Run fn(client) inside a single transaction. Use this for anything that changes order status,
 * writes ledger entries or adjusts stock (they must commit or roll back together).
 */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
