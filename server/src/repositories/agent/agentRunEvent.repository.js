// All queries for the `agent_run_events` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

/** Append an event with the next sequence number for that run. */
export async function appendEvent(shopId, runId, type, payload = {}, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `INSERT INTO agent_run_events (run_id, seq, type, payload)
     SELECT r.id, COALESCE(MAX(e.seq), 0) + 1, $3, $4
       FROM agent_runs r LEFT JOIN agent_run_events e ON e.run_id = r.id
      WHERE r.shop_id = $1 AND r.id = $2
      GROUP BY r.id
      RETURNING id, run_id, seq, type, payload, created_at`,
    [shopId, runId, type, payload], db,
  )
  return rows[0] ?? null
}

export async function listEvents(shopId, runId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT e.id, e.run_id, e.seq, e.type, e.payload, e.created_at
       FROM agent_run_events e JOIN agent_runs r ON r.id = e.run_id
      WHERE r.shop_id = $1 AND e.run_id = $2
      ORDER BY e.seq`,
    [shopId, runId], db,
  )
  return rows
}
