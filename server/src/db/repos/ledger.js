import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = `id, shop_id, type, category, amount, order_id, note, occurred_at, created_at,
  source, label_id, counterparty, raw_description, dedupe_key, run_id`

export async function list(shopId, { from, to, type, labelId, limit = 100, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  for (const [column, value] of [['occurred_at >=', from], ['occurred_at <', to], ['type =', type], ['label_id =', labelId]]) {
    if (value === undefined || value === null) continue
    params.push(value)
    where += ` AND ${column} $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM ledger_entries WHERE ${where}
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM ledger_entries WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function create(shopId, entry, db = pool) {
  requireShopId(shopId)
  const {
    type, category, amount, orderId = null, note = null, occurredAt = new Date(),
    source = 'manual', labelId = null, counterparty = null, rawDescription = null,
    dedupeKey = null, runId = null,
  } = entry
  const { rows } = await db.query(
    `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at,
                                 source, label_id, counterparty, raw_description, dedupe_key, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${columns}`,
    [shopId, type, category, amount, orderId, note, occurredAt, source, labelId, counterparty, rawDescription, dedupeKey, runId],
  )
  return rows[0]
}

/** Bank/webhook imports: the same dedupe_key never creates a second row. */
export async function createOnce(shopId, entry, db = pool) {
  requireShopId(shopId)
  const {
    type, category, amount, orderId = null, note = null, occurredAt = new Date(),
    source = 'manual', labelId = null, counterparty = null, rawDescription = null,
    dedupeKey, runId = null,
  } = entry
  if (!dedupeKey) throw new Error('dedupeKey is required by createOnce')
  const { rows } = await db.query(
    `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at,
                                 source, label_id, counterparty, raw_description, dedupe_key, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (shop_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING ${columns}`,
    [shopId, type, category, amount, orderId, note, occurredAt, source, labelId, counterparty, rawDescription, dedupeKey, runId],
  )
  if (rows[0]) return { entry: rows[0], inserted: true }
  const existing = await db.query(
    `SELECT ${columns} FROM ledger_entries WHERE shop_id = $1 AND dedupe_key = $2`,
    [shopId, dedupeKey],
  )
  return { entry: existing.rows[0] ?? null, inserted: false }
}

export async function remove(shopId, id, db = pool) {
  requireShopId(shopId)
  const result = await db.query('DELETE FROM ledger_entries WHERE shop_id = $1 AND id = $2', [shopId, id])
  return result.rowCount > 0
}
