import { pool } from '../pool.js'

const columns = 'id, provider, external_id, type, shop_id, payload, status, error, received_at, processed_at'

/**
 * Claim an incoming event. The unique (provider, external_id) pair makes provider retries
 * a no-op: `inserted: false` means "already received, do not process again".
 */
export async function claim({ provider, externalId, type, shopId = null, payload }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO webhook_events (provider, external_id, type, shop_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, external_id) DO NOTHING
     RETURNING ${columns}`,
    [provider, externalId, type, shopId, payload],
  )
  if (rows[0]) return { event: rows[0], inserted: true }
  const existing = await db.query(
    `SELECT ${columns} FROM webhook_events WHERE provider = $1 AND external_id = $2`,
    [provider, externalId],
  )
  return { event: existing.rows[0] ?? null, inserted: false }
}

export async function markProcessed(id, status = 'PROCESSED', error = null, db = pool) {
  await db.query(
    `UPDATE webhook_events SET status = $2, error = $3, processed_at = now() WHERE id = $1`,
    [id, status, error],
  )
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${columns} FROM webhook_events WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function list({ provider, status, limit = 100 } = {}, db = pool) {
  const params = []
  const filters = []
  if (provider) {
    params.push(provider)
    filters.push(`provider = $${params.length}`)
  }
  if (status) {
    params.push(status)
    filters.push(`status = $${params.length}`)
  }
  params.push(limit)
  const { rows } = await db.query(
    `SELECT ${columns} FROM webhook_events
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY received_at DESC LIMIT $${params.length}`,
    params,
  )
  return rows
}
