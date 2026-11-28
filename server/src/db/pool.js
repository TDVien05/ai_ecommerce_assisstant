import pg from 'pg'
import { getPool, closeDataSource } from './dataSource.js'

// Money is BIGINT VND in the DB and `number` in JS. pg returns int8 as string by default;
// VND amounts stay far below Number.MAX_SAFE_INTEGER, so parse them as numbers.
// The parser is global to the pg module, so it also applies to TypeORM's pool.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))

/**
 * SQL access to the server's single pool (owned by db/dataSource.js). Same calls as a pg.Pool:
 * query(text, params), connect() for a transaction client, end() to close the pool.
 * Used by config/database.js and the migrate / seed scripts; repositories go through config/database.js.
 */
export const pool = {
  query: async (text, params) => (await getPool()).query(text, params),
  connect: async () => (await getPool()).connect(),
  end: () => closeDataSource(),
}

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
