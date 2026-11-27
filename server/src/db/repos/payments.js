import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = `id, shop_id, sepay_id, gateway, account_number, code, content, reference_code,
  transfer_type, transfer_amount, transaction_date, order_id, match_status, raw, created_at`

/**
 * Store a SePay transaction. A repeated `sepay_id` is a provider retry: the existing row comes
 * back with `inserted: false` and nothing is processed twice.
 */
export async function insert(shopId, transaction, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                       reference_code, transfer_type, transfer_amount, transaction_date,
                                       order_id, match_status, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (sepay_id) DO NOTHING
     RETURNING ${columns}`,
    [shopId, transaction.sepayId, transaction.gateway ?? null, transaction.accountNumber ?? null,
      transaction.code ?? null, transaction.content ?? null, transaction.referenceCode ?? null,
      transaction.transferType ?? null, transaction.transferAmount, transaction.transactionDate ?? null,
      transaction.orderId ?? null, transaction.matchStatus ?? null, transaction.raw ?? {}],
  )
  if (rows[0]) return { transaction: rows[0], inserted: true }
  const existing = await findBySepayId(shopId, transaction.sepayId, db)
  return { transaction: existing, inserted: false }
}

export async function findBySepayId(shopId, sepayId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT ${columns} FROM payment_transactions WHERE shop_id = $1 AND sepay_id = $2`,
    [shopId, sepayId],
  )
  return rows[0] ?? null
}

export async function list(shopId, { matchStatus, limit = 100, offset = 0 } = {}, db = pool) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (matchStatus) {
    params.push(matchStatus)
    where += ` AND match_status = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await db.query(
    `SELECT ${columns} FROM payment_transactions WHERE ${where}
      ORDER BY transaction_date DESC NULLS LAST, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function setMatch(shopId, id, { orderId = null, matchStatus }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `UPDATE payment_transactions SET order_id = COALESCE($3, order_id), match_status = $4
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, orderId, matchStatus],
  )
  return rows[0] ?? null
}

/** True when this shop already reconciled a payment with that code (reused transfer code). */
export async function hasMatchedCode(shopId, code, db = pool) {
  requireShopId(shopId)
  if (!code) return false
  const { rows } = await db.query(
    `SELECT 1 FROM payment_transactions
      WHERE shop_id = $1 AND code = $2 AND match_status IN ('MATCHED', 'UNDERPAID') LIMIT 1`,
    [shopId, code],
  )
  return rows.length > 0
}
