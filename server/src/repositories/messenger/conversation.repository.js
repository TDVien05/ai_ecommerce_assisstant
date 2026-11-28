// All queries for the `conversations` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, shop_id, customer_id, ai_paused, created_at'

export async function list(shopId, { limit = 50, offset = 0 } = {}, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM conversations WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [shopId, limit, offset], db,
  )
  return rows
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM conversations WHERE shop_id = $1 AND id = $2`, [shopId, id], db)
  return rows[0] ?? null
}

export async function listRecipients(shopId, db) {
  requireShopId(shopId)
  const {rows}=await query('SELECT c.id, COALESCE(NULLIF(u.name,\'\'),\'Khách hàng\') AS name FROM conversations c JOIN customers u ON u.id=c.customer_id AND u.shop_id=c.shop_id WHERE c.shop_id=$1 ORDER BY c.created_at DESC LIMIT 100',[shopId],db)
  return rows
}

export async function findByCustomer(shopId, customerId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT ${columns} FROM conversations WHERE shop_id = $1 AND customer_id = $2`,
    [shopId, customerId], db,
  )
  return rows[0] ?? null
}

/** One conversation per customer; returns the existing row when it already exists. */
export async function ensureForCustomer(shopId, customerId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO conversations (shop_id, customer_id) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
     RETURNING ${columns}`,
    [shopId, customerId], db,
  )
  return rows[0]
}

export async function setAiPaused(shopId, id, aiPaused, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `UPDATE conversations SET ai_paused = $3 WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
    [shopId, id, aiPaused], db,
  )
  return rows[0] ?? null
}

/** Demo copy: conversations, matched to the copied customers by psid. Run after customers. */
export async function copyFromShop(shopId, templateId, db) {
  await query(
    `INSERT INTO conversations (shop_id, customer_id, ai_paused)
     SELECT $1, nc.id, oc.ai_paused
       FROM conversations oc
       JOIN customers tc ON tc.id = oc.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
      WHERE oc.shop_id = $2`,
    [shopId, templateId], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM conversations WHERE shop_id = $1', [shopId], db)
}
