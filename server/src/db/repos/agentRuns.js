import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

const columns = `id, shop_id, user_id, conversation_id, command, status, plan, result, error,
  created_at, updated_at, finished_at`

export async function create(shopId, { userId = null, conversationId = null, command, plan = null }, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO agent_runs (shop_id, user_id, conversation_id, command, plan)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
    [shopId, userId, conversationId, command, plan],
  )
  return rows[0]
}

export async function findById(shopId, id, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(`SELECT ${columns} FROM agent_runs WHERE shop_id = $1 AND id = $2`, [shopId, id])
  return rows[0] ?? null
}

export async function setStatus(shopId, id, status, { result, error } = {}, db = pool) {
  requireShopId(shopId)
  const finished = ['DONE', 'CANCELLED', 'FAILED', 'UNDONE'].includes(status)
  const { rows } = await db.query(
    `UPDATE agent_runs
        SET status = $3, result = COALESCE($4, result), error = $5, updated_at = now(),
            finished_at = CASE WHEN $6 THEN now() ELSE finished_at END
      WHERE shop_id = $1 AND id = $2
      RETURNING ${columns}`,
    [shopId, id, status, result ?? null, error ?? null, finished],
  )
  return rows[0] ?? null
}

/** Append an event with the next sequence number for that run. */
export async function appendEvent(shopId, runId, type, payload = {}, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `INSERT INTO agent_run_events (run_id, seq, type, payload)
     SELECT r.id, COALESCE(MAX(e.seq), 0) + 1, $3, $4
       FROM agent_runs r LEFT JOIN agent_run_events e ON e.run_id = r.id
      WHERE r.shop_id = $1 AND r.id = $2
      GROUP BY r.id
      RETURNING id, run_id, seq, type, payload, created_at`,
    [shopId, runId, type, payload],
  )
  return rows[0] ?? null
}

export async function listEvents(shopId, runId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT e.id, e.run_id, e.seq, e.type, e.payload, e.created_at
       FROM agent_run_events e JOIN agent_runs r ON r.id = e.run_id
      WHERE r.shop_id = $1 AND e.run_id = $2
      ORDER BY e.seq`,
    [shopId, runId],
  )
  return rows
}
