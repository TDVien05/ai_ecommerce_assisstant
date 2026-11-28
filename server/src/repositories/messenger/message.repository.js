// All queries for the `messages` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id, conversation_id, mid, role, content, created_at'

export async function listByConversation(shopId, conversationId, { limit = 100 } = {}, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT m.${columns.split(', ').join(', m.')}
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.shop_id = $1 AND m.conversation_id = $2
      ORDER BY m.created_at DESC
      LIMIT $3`,
    [shopId, conversationId, limit], db,
  )
  return rows.reverse()
}

/** Store a message. A repeated Meta `mid` is ignored instead of duplicated. */
export async function create(shopId, { conversationId, mid = null, role, content = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, mid, role, content)
     SELECT c.id, $3, $4, $5 FROM conversations c WHERE c.id = $2 AND c.shop_id = $1
     ON CONFLICT (mid) DO NOTHING
     RETURNING ${columns}`,
    [shopId, conversationId, mid, role, content], db,
  )
  return rows[0] ?? null
}

/**
 * Store a message with its original timestamp (history backfill). Same dedupe as `create()`.
 * `createdAt` stays null for live webhook traffic, which uses the column default.
 */
export async function createAt(shopId, { conversationId, mid = null, role, content = null, createdAt = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, mid, role, content, created_at)
     SELECT c.id, $3, $4, $5, COALESCE($6, now()) FROM conversations c WHERE c.id = $2 AND c.shop_id = $1
     ON CONFLICT (mid) DO NOTHING
     RETURNING ${columns}`,
    [shopId, conversationId, mid, role, content, createdAt], db,
  )
  return rows[0] ?? null
}

export async function findByMid(shopId, mid, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT m.${columns.split(', ').join(', m.')}
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.shop_id = $1 AND m.mid = $2`,
    [shopId, mid], db,
  )
  return rows[0] ?? null
}

/**
 * Demo copy: messages, shifted by `interval` and with `midSuffix` appended to the unique mid.
 * Run after conversations.
 */
export async function copyFromShop(shopId, templateId, interval, midSuffix, db) {
  await query(
    `INSERT INTO messages (conversation_id, mid, role, content, created_at)
     SELECT nconv.id, m.mid || ':' || $4, m.role, m.content, m.created_at + $3::interval
       FROM messages m
       JOIN conversations oc ON oc.id = m.conversation_id
       JOIN customers tc ON tc.id = oc.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
       JOIN conversations nconv ON nconv.shop_id = $1 AND nconv.customer_id = nc.id
      WHERE oc.shop_id = $2`,
    [shopId, templateId, interval, midSuffix], db,
  )
}
