import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = 'id, conversation_id, mid, role, content, created_at'

export async function listByConversation(shopId, conversationId, { limit = 100 } = {}, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT m.${columns.split(', ').join(', m.')}
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.shop_id = $1 AND m.conversation_id = $2
      ORDER BY m.created_at DESC
      LIMIT $3`,
    [shopId, conversationId, limit],
  )
  return rows.reverse()
}

/** Store a message. A repeated Meta `mid` is ignored instead of duplicated. */
export async function create(shopId, { conversationId, mid = null, role, content = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO messages (conversation_id, mid, role, content)
     SELECT c.id, $3, $4, $5 FROM conversations c WHERE c.id = $2 AND c.shop_id = $1
     ON CONFLICT (mid) DO NOTHING
     RETURNING ${columns}`,
    [shopId, conversationId, mid, role, content],
  )
  return rows[0] ?? null
}

export async function findByMid(shopId, mid, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT m.${columns.split(', ').join(', m.')}
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.shop_id = $1 AND m.mid = $2`,
    [shopId, mid],
  )
  return rows[0] ?? null
}
