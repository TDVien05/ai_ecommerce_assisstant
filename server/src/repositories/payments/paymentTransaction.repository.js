// All queries for the `payment_transactions` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = `id, shop_id, sepay_id, gateway, account_number, code, content, reference_code,
  transfer_type, transfer_amount, transaction_date, order_id, match_status, raw, created_at`

/**
 * Store a SePay transaction. A repeated `sepay_id` is a provider retry: the existing row comes
 * back with `inserted: false` and nothing is processed twice.
 */
export async function insert(shopId, transaction, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                       reference_code, transfer_type, transfer_amount, transaction_date,
                                       order_id, match_status, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (sepay_id) DO NOTHING
     RETURNING ${columns}`,
    [shopId, transaction.sepayId, transaction.gateway ?? null, transaction.accountNumber ?? null,
      transaction.code ?? null, transaction.content ?? null, transaction.referenceCode ?? null,
      transaction.transferType ?? null, transaction.transferAmount, transaction.transactionDate ?? null,
      transaction.orderId ?? null, transaction.matchStatus ?? null, transaction.raw ?? {}], db,
  )
  if (rows[0]) return { transaction: rows[0], inserted: true }
  const existing = await findBySepayId(shopId, transaction.sepayId, db)
  return { transaction: existing, inserted: false }
}

export async function findBySepayId(shopId, sepayId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM payment_transactions WHERE shop_id = $1 AND sepay_id = $2`,
    [shopId, sepayId], db,
  )
  return rows[0] ?? null
}

export async function list(shopId, { matchStatus, limit = 100, offset = 0 } = {}, db) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  if (matchStatus) {
    params.push(matchStatus)
    where += ` AND match_status = $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await query(
    `SELECT ${columns} FROM payment_transactions WHERE ${where}
      ORDER BY transaction_date DESC NULLS LAST, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params, db,
  )
  return rows
}

export async function setMatch(shopId, id, { orderId = null, matchStatus }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `UPDATE payment_transactions SET order_id = COALESCE($3, order_id), match_status = $4
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, orderId, matchStatus], db,
  )
  return rows[0] ?? null
}

/** True when this shop already reconciled a payment with that code (reused transfer code). */
export async function hasMatchedCode(shopId, code, db) {
  requireShopId(shopId)
  if (!code) return false
  const { rows } = await query(
    `SELECT 1 FROM payment_transactions
      WHERE shop_id = $1 AND code = $2 AND match_status IN ('MATCHED', 'UNDERPAID') LIMIT 1`,
    [shopId, code], db,
  )
  return rows.length > 0
}

export async function findPayments(shopId,id,client) {
  const { rows } = await query(`SELECT p.id,p.gateway,p.account_number,p.code,p.content,p.reference_code,p.transfer_type,p.transfer_amount,p.transaction_date,p.order_id,p.match_status FROM payment_transactions p JOIN orders o ON o.id=p.order_id WHERE o.shop_id=$1 AND o.id=$2 ORDER BY p.created_at DESC`, [shopId,id], client)
  return rows
}

/** sepay_id is globally unique; demo copies draw from their own sequence so two copies never collide. */
export async function ensureDemoSequence(db) {
  await query('CREATE SEQUENCE IF NOT EXISTS demo_sepay_seq START 1000000', undefined, db)
}

/** Demo copy: SePay transactions, shifted by `interval`, linked to the copied orders (demo_order_map). */
export async function copyFromShop(shopId, templateId, interval, codeSuffix, db) {
  await query(
    `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                       reference_code, transfer_type, transfer_amount, transaction_date,
                                       order_id, match_status, raw)
     SELECT $1, nextval('demo_sepay_seq'), t.gateway, t.account_number,
            CASE WHEN t.code IS NULL THEN NULL ELSE t.code || '-' || $4 END,
            t.content, t.reference_code, t.transfer_type, t.transfer_amount,
            t.transaction_date + $3::interval, m.new_id, t.match_status, t.raw
       FROM payment_transactions t
       LEFT JOIN demo_order_map m ON m.old_id = t.order_id
      WHERE t.shop_id = $2`,
    [shopId, templateId, interval, codeSuffix], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM payment_transactions WHERE shop_id = $1', [shopId], db)
}
