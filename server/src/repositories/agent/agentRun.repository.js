// All queries for the `agent_runs` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = `id, shop_id, user_id, conversation_id, command, status, plan, result, error,
  created_at, updated_at, finished_at`

export async function create(shopId, { userId = null, conversationId = null, command, plan = null }, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO agent_runs (shop_id, user_id, conversation_id, command, plan)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
    [shopId, userId, conversationId, command, plan], db,
  )
  return rows[0]
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM agent_runs WHERE shop_id = $1 AND id = $2`, [shopId, id], db)
  return rows[0] ?? null
}

export async function setStatus(shopId, id, status, { result, error } = {}, db) {
  requireShopId(shopId)
  const finished = ['DONE', 'CANCELLED', 'FAILED', 'UNDONE'].includes(status)
  const { rows } = await query(
    `UPDATE agent_runs
        SET status = $3, result = COALESCE($4, result), error = $5, updated_at = now(),
            finished_at = CASE WHEN $6 THEN now() ELSE finished_at END
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, status, result ?? null, error ?? null, finished], db,
  )
  return rows[0] ?? null
}
