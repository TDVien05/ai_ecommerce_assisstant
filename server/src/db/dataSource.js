// TypeORM DataSource. It owns the server's ONE connection pool: TypeORM repositories use it
// directly and SQL queries (db/pool.js) borrow connections from the same pool.
// See docs/ARCHITECTURE.md, sections "Database access" and "Models (TypeORM)".
import { DataSource } from 'typeorm'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { entities } from '../models/index.js'

/** Options shared by the app and the schema test. The SQL migrations own the schema. */
export const dataSourceOptions = {
  type: 'postgres',
  url: env.DATABASE_URL,
  entities,
  synchronize: false, // never let TypeORM change the schema
  migrationsRun: false,
  installExtensions: false, // no CREATE EXTENSION against production; gen_random_uuid() is built in
  uuidExtension: 'pgcrypto',
  logging: false,
  // The single pool: at most DB_POOL_MAX connections; idle connections never keep a process alive.
  extra: { max: env.DB_POOL_MAX, allowExitOnIdle: true },
  poolErrorHandler: (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'),
}

let dataSource = null
let starting = null

/** Initialized DataSource; connects on first call. */
export async function getDataSource() {
  if (dataSource?.isInitialized) return dataSource
  starting ??= new DataSource(dataSourceOptions).initialize()
    .then((ready) => { dataSource = ready; return ready })
    .finally(() => { starting = null })
  return starting
}

/** The pg Pool inside TypeORM's Postgres driver: the one pool every query uses. */
export async function getPool() {
  return (await getDataSource()).driver.master
}

/** Close the pool if it was opened. Safe to call when nothing connected yet. */
export async function closeDataSource() {
  if (starting) await starting.catch(() => {})
  if (dataSource?.isInitialized) await dataSource.destroy()
  dataSource = null
}
