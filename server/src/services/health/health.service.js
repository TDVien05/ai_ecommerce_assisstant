import { ping } from '../../repositories/database.js'

/** Returns true when PostgreSQL answers a trivial query. */
export async function isDbUp() {
  return ping()
}
