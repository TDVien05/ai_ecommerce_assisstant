// The one door to the database. Repositories import from here, never from db/pool.js or
// db/dataSource.js. See docs/ARCHITECTURE.md, section "Database access (config/database.js)".
// One pool serves everything: db/dataSource.js creates it, db/pool.js lends SQL connections from it.
import { pool, withTransaction as pgTransaction } from '../db/pool.js'
import { getDataSource, closeDataSource } from '../db/dataSource.js'

/** Run SQL and return the pg result ({ rows, rowCount }); inside a transaction when `client` is given. */
export function query(text, params, client) {
  return (client ?? pool).query(text, params)
}

/** fn(client) in one pg transaction; pass `client` to every query() inside it. */
export function withTransaction(fn) {
  return pgTransaction(fn)
}

/** TypeORM repository of a model from models/, e.g. `await getRepository(User)`. Connects on first use. */
export async function getRepository(Model) {
  return (await getDataSource()).getRepository(Model)
}

/** fn(manager) in one TypeORM transaction; use manager.getRepository(Model) inside. */
export async function transaction(fn) {
  return (await getDataSource()).transaction(fn)
}

/** True when PostgreSQL answers a trivial query (health check). */
export async function ping() {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

/** Close the single connection pool (if it was opened). */
export function closeDatabase() {
  return closeDataSource()
}
